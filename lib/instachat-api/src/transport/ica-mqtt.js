'use strict';

/**
 * Instagram MQTT-over-WebSocket client ported from InstaBOT (ica/src/mqtt/instagramRealtime.js).
 *
 *  - uses the `mqtt` library over wss://edge-chat.instagram.com/chat (cookie auth, MQIsdp v3)
 *  - relaxes mqtt-packet header-flag checks for Instagram's custom proxygen MQTT
 *  - tries several endpoints, reconnects with exponential backoff + jitter
 *  - subscribes to the /ig_* topics and requests an Iris sync
 *
 * In IG2 this is only a PUSH SIGNAL: every incoming packet emits 'publish' and the
 * trigger wakes the (well tested) polling loop, which fetches + parses the messages.
 * Needs the packages `mqtt`, `duplexify` and `ws`.
 */

// Relax strict MQTT header flag checks for Instagram custom FB-MQTT proxygen protocol
try {
  const mqttConstants = require('mqtt-packet/constants');
  if (mqttConstants && mqttConstants.requiredHeaderFlags) {
    delete mqttConstants.requiredHeaderFlags[4]; // puback
    delete mqttConstants.requiredHeaderFlags[9]; // suback
  }
} catch (_) {}

const mqtt = require('mqtt');
const EventEmitter = require('events');
const zlib = require('zlib');
const WebSocket = require('ws');
const { PassThrough, Writable } = require('stream');
const Duplexify = require('duplexify');

// logger shim: the original code used log.silly/info/warn/error
let activeLogger = null;
const _emit = (lvl, args) => {
  const fn = activeLogger && activeLogger[lvl];
  if (typeof fn === 'function') fn.call(activeLogger, '[ICA-MQTT] ' + args.map(String).join(' '));
};
const log = {
  info: (...a) => _emit('info', a),
  warn: (...a) => _emit('warn', a),
  error: (...a) => _emit('error', a),
  silly: (...a) => _emit('debug', a)
};

class InstagramMQTTClient extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.session  IG2 Session (.cookies map with sessionid, ds_user_id, csrftoken)
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    super();
    this.session = options.session || {};
    activeLogger = options.logger || null;
    const c = this.session.cookies || {};

    this.userId = String(this.session.userId || c.ds_user_id || '');
    this.sessionId = c.sessionid || '';
    this.csrftoken = c.csrftoken || '';
    this.igDid = c.ig_did || '';
    this.userAgent = options.userAgent || '';
    this.cookies = '';

    this.deviceId = options.deviceId || this._generateDeviceId();
    this.phoneId = options.phoneId || this._generateUUID();
    this.uuid = options.uuid || this._generateUUID();
    this.advertisingId = options.advertisingId || this._generateUUID();

    this.appId = '124024574287414';
    this.capabilities = '10';

    this.mqttClient = null;
    this.connected = false;
    this.connectPromise = null;
    this.activeEndpoint = null;
    this.seqId = 0;
    this.snapshotAtMs = Date.now();
    this.irisToken = null;
    this.subscribedTopics = new Set();
    this.manualDisconnect = false;

    this.reconnectStrategy = {
      baseDelayMs: options.reconnectBaseDelayMs || 1000,
      maxDelayMs: options.reconnectMaxDelayMs || 30000,
      backoffMultiplier: options.reconnectBackoffMultiplier || 1.5,
      jitterRatio: options.reconnectJitterRatio || 0.2
    };
    this.reconnectAttempts = 0;
  }

  /**
   * Compute the next reconnect delay using exponential backoff + jitter.
   * The attempt counter is reset to 0 by `_onConnected` after a successful
   * handshake, ensuring transient drops don't poison long-running clients.
   */
  _nextReconnectDelay() {
    const { baseDelayMs, maxDelayMs, backoffMultiplier, jitterRatio } = this.reconnectStrategy;
    const exp = baseDelayMs * Math.pow(backoffMultiplier, this.reconnectAttempts);
    const capped = Math.min(maxDelayMs, exp);
    const jitter = (Math.random() * 2 - 1) * jitterRatio * capped; // ±jitterRatio * capped
    this.reconnectAttempts += 1;
    return Math.max(baseDelayMs, Math.floor(capped + jitter));
  }

  _generateDeviceId() {
    return 'android-' + Math.random().toString(36).substring(2, 15);
  }

  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async connect() {
    if (this.connected && this.mqttClient) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    if (!this.userId || !this.sessionId) {
      throw new Error('User ID and session ID required');
    }

    this.manualDisconnect = false;
    this.connectPromise = (async () => {
      try {
        log.info('Registering with Iris...');
        await this._registerIris();
        await this._connectMQTT();
      } finally {
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }
  

  // Iris registration is optional here: IG2 polling already tracks the inbox position.
  async _registerIris() { /* seqId stays 0 -> initial_sync */ }

  async _connectMQTT() {
    if (this.mqttClient) {
      try {
        this.mqttClient.removeAllListeners();
        this.mqttClient.end(true);
      } catch (_) {}
      this.mqttClient = null;
    }

    const cookieHeader = this._buildCookieHeader();
    const cid = this.uuid || this.deviceId;
    const endpoints = [
      this._buildEndpoint(cid),
      `wss://edge-chat.facebook.com/chat?sid=${this._generateSessionId()}&cid=${encodeURIComponent(cid)}`,
      'wss://edge-chat.instagram.com/chat'
    ];

    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        await this._connectToEndpoint(endpoint, cookieHeader, cid);
        return;
      } catch (error) {
        lastError = error;
        log.warn(`Connection attempt failed for ${endpoint}: ${error.message}`);
      }
    }

    throw lastError || new Error('MQTT handshake rejected for all known endpoints');
  }

  _generateSessionId() {
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) + 1;
  }

  _getDefaultUserAgent() {
    return this.userAgent || 'Instagram 350.0.0.0.0 Android (28/8.1.0; 480dpi; 1080x1920; Google; Pixel 2; walleye; qcom; en_US; 143991798)';
  }

  _buildEndpoint(cid) {
    return `wss://edge-chat.instagram.com/chat?sid=${this._generateSessionId()}&cid=${encodeURIComponent(cid)}`;
  }

  _buildCookieHeader() {
    const jar = (this.session && this.session.cookies) || {};
    const existing = Object.entries(jar).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ').trim() || (this.cookies || '').trim();
    if (existing) {
      return existing;
    }

    const parts = [
      this.sessionId ? `sessionid=${decodeURIComponent(this.sessionId)}` : null,
      this.csrftoken ? `csrftoken=${this.csrftoken}` : null,
      this.igDid ? `ig_did=${this.igDid}` : null,
      this.userId ? `ds_user_id=${this.userId}` : null
    ].filter(Boolean);

    return parts.join('; ');
  }

  _buildWsHeaders(cookieHeader) {
    return {
      'User-Agent': this._getDefaultUserAgent(),
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://www.instagram.com',
      'Referer': 'https://www.instagram.com/direct/inbox/',
      'Sec-WebSocket-Version': '13',
      'Sec-Fetch-Dest': 'websocket',
      'Sec-Fetch-Mode': 'websocket',
      'Sec-Fetch-Site': 'same-site',
      'sec-ch-ua': '"Google Chrome";v="133", "Chromium";v="133", "Not?A_Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'X-IG-App-ID': '936619743392459',
      'X-ASBD-ID': '129477',
      'X-IG-D': this.igDid || '',
      'X-CSRFToken': this.csrftoken || '',
      'Cookie': cookieHeader
    };
  }

  _buildUsernamePayload({ sid, cid }) {
    return JSON.stringify({
      u: this._getDefaultUserAgent(),
      a: 'Instagram',
      mqtt_sid: sid,
      chat_on: true,
      fg: false,
      no_auto_fg: true,
      d: cid,
      ds: '',
      ct: 'cookie_auth',
      aid: 936619743392459,
      cp: 3,
      ecp: 10,
      st: [
        '/ig_message_sync',
        '/ig_realtime_sub',
        '/ig_send_message_response',
        '/ig_sub_iris_response',
        '/pubsub',
        '/pp',
        '/t_region_hint'
      ],
      pm: [],
      dc: '',
      php_override: '',
      app_specific_info: {
        platform: 'android',
        app_version: '350.0.0.0.0',
        capabilities: '3brTvx0=',
        'User-Agent': this._getDefaultUserAgent(),
        'Accept-Language': 'en-US',
        ig_mqtt_route: 'django',
        auth_cache_enabled: '0',
        pubsub_msg_type_blacklist: '{"direct":"typing_type"}'
      }
    });
  }

  _createWebsocketFactory() {
    return (url, websocketSubProtocols, options) => {
      const dynamicHeaders = options && options.wsOptions && options.wsOptions.headers
        ? options.wsOptions.headers
        : {};
      const wsOpts = {
        ...(options && options.wsOptions ? options.wsOptions : {}),
        headers: dynamicHeaders,
        perMessageDeflate: true,
        protocolVersion: 13
      };

      const ws = new WebSocket(url, websocketSubProtocols, wsOpts);
      ws.on('unexpected-response', (_req, res) => {
        log.warn(`WS unexpected response: ${res && res.statusCode ? res.statusCode : 'unknown'}`);
      });
      ws.on('close', (code, reason) => {
        const closeReason = reason ? reason.toString() : '';
        log.warn(`WS close code=${code}${closeReason ? ` reason=${closeReason}` : ''}`);
      });
      return ws;
    };
  }

  _buildProxy() {
    let target = null;
    let ended = false;

    const proxy = new Writable({
      autoDestroy: true,
      write(chunk, _enc, cb) {
        if (ended || this.destroyed) return cb();
        const ws = target;
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk), cb);
          } catch (error) {
            cb(error);
          }
        } else {
          cb();
        }
      },
      writev(chunks, cb) {
        if (ended || this.destroyed) return cb();
        const ws = target;
        if (!ws || ws.readyState !== WebSocket.OPEN) return cb();
        try {
          for (const { chunk } of chunks) {
            ws.send(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          cb();
        } catch (error) {
          cb(error);
        }
      },
      final(cb) {
        ended = true;
        const ws = target;
        target = null;
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          try {
            ws.terminate();
          } catch (_) {
            // Ignore termination errors during shutdown.
          }
        }
        cb();
      }
    });

    proxy.setTarget = (ws) => {
      if (!ended) {
        target = ws;
      }
    };
    proxy.hardEnd = () => {
      ended = true;
      target = null;
    };

    return proxy;
  }

  _buildStream(url, mqttOptions) {
    const ws = new WebSocket(url, mqttOptions.wsOptions);
    const proxy = this._buildProxy();
    const readable = new PassThrough();
    const stream = Duplexify(undefined, undefined, { end: false, autoDestroy: true });
    const noopWritable = new Writable({ write(_chunk, _enc, cb) { cb(); } });

    let pingTimer = null;
    let livenessTimer = null;
    let lastActivity = Date.now();
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(pingTimer);
      clearInterval(livenessTimer);
      pingTimer = null;
      livenessTimer = null;
      proxy.hardEnd();
      try {
        stream.setWritable(noopWritable);
      } catch (_) {}
      try {
        readable.end();
      } catch (_) {}
    };

    ws.on('open', () => {
      proxy.setTarget(ws);
      stream.setWritable(proxy);
      stream.setReadable(readable);
      stream.emit('connect');
      lastActivity = Date.now();

      clearInterval(pingTimer);
      clearInterval(livenessTimer);

      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.ping();
          } catch (_) {}
        }
      }, 30000);

      livenessTimer = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastActivity > 65000) {
          try {
            ws.terminate();
          } catch (_) {}
        }
      }, 10000);
    });

    ws.on('message', (data) => {
      lastActivity = Date.now();
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      readable.write(buffer);
    });

    ws.on('pong', () => {
      lastActivity = Date.now();
    });

    ws.on('unexpected-response', (_req, res) => {
      log.warn(`WS unexpected response: ${res && res.statusCode ? res.statusCode : 'unknown'}`);
    });

    ws.on('error', (error) => {
      cleanup();
      stream.destroy(error);
    });

    ws.on('close', (code, reason) => {
      const closeReason = reason ? reason.toString() : '';
      log.warn(`WS close code=${code}${closeReason ? ` reason=${closeReason}` : ''}`);
      cleanup();
      stream.end();
      if (!stream.destroyed) {
        stream.destroy();
      }
    });

    stream.on('prefinish', () => {
      try {
        stream.setWritable(noopWritable);
      } catch (_) {}
    });
    stream.on('finish', cleanup);
    stream.on('close', cleanup);
    proxy.on('close', () => {
      try {
        stream.setWritable(noopWritable);
      } catch (_) {}
    });

    return stream;
  }

  _createMqttClient(endpoint, mqttOptions) {
    return new mqtt.Client(() => {
      const url = endpoint.includes('sid=')
        ? this._buildEndpoint(this.uuid || this.deviceId)
        : endpoint;

      const refreshedCookieHeader = this._buildCookieHeader();
      mqttOptions.username = this._buildUsernamePayload({
        sid: this._generateSessionId(),
        cid: this.uuid || this.deviceId
      });
      mqttOptions.password = refreshedCookieHeader;
      mqttOptions.wsOptions = {
        headers: this._buildWsHeaders(refreshedCookieHeader),
        perMessageDeflate: true,
        protocolVersion: 13
      };

      return this._buildStream(url, mqttOptions);
    }, mqttOptions);
  }

  _buildMqttOptions(endpoint, cookieHeader, cid) {
    const sid = this._generateSessionId();
    const headers = this._buildWsHeaders(cookieHeader);

    return {
      clientId: `mqttwsclient_${Math.random().toString(36).slice(2, 10)}`,
      username: this._buildUsernamePayload({ sid, cid }),
      password: cookieHeader,
      protocol: 'wss',
      protocolId: 'MQIsdp',
      protocolVersion: 3,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 0,
      connectTimeout: 15000,
      resubscribe: false,
      queueQoSZero: true,
      reconnectOnConnackError: true,
      wsOptions: { headers },
      rejectUnauthorized: false,
      incomingStore: undefined,
      outgoingStore: undefined
    };
  }

  _connectToEndpoint(endpoint, cookieHeader, cid) {
    return new Promise((resolve, reject) => {
      const mqttOptions = this._buildMqttOptions(endpoint, cookieHeader, cid);
      const client = this._createMqttClient(endpoint, mqttOptions);

      let settled = false;
      let connected = false;

      const cleanup = () => {
        clearTimeout(failTimer);
        client.removeListener('connect', onConnect);
        client.removeListener('error', onError);
        client.removeListener('close', onClose);
        client.removeListener('offline', onOffline);
      };

      const fail = (error) => {
        if (settled || connected) return;
        settled = true;
        cleanup();
        try {
          client.end(true);
        } catch (_) {
          // Ignore shutdown errors for failed probes.
        }
        reject(error);
      };

      const onConnect = (connack) => {
        if (settled) return;
        if (connack && typeof connack.returnCode === 'number' && connack.returnCode !== 0) {
          fail(new Error(`MQTT connack rejected with return code ${connack.returnCode}`));
          return;
        }

        settled = true;
        connected = true;
        cleanup();

        this.mqttClient = client;
        this.connected = true;
        this.activeEndpoint = endpoint;
        // Reset backoff after a successful handshake so future drops don't
        // accumulate exponentially.
        this.reconnectAttempts = 0;

        // After the first successful handshake we let MQTT.js keep the
        // websocket alive and reconnect on transient drops, with the delay
        // chosen by our exponential-backoff + jitter strategy.
        this.mqttClient.options.reconnectPeriod = this._nextReconnectDelay();

        this._bindPersistentClientHandlers(client, endpoint, cid);
        this._onConnected(endpoint, 'cookie-auth');
        resolve();
      };

      const onError = (error) => fail(error);
      const onClose = () => fail(new Error('Socket closed before MQTT connect completed'));
      const onOffline = () => fail(new Error('Socket went offline before MQTT connect completed'));

      const failTimer = setTimeout(() => {
        fail(new Error('MQTT connect timeout'));
      }, 16000);

      log.info(`Connecting to ${endpoint} [cookie-auth]...`);
      client.once('connect', onConnect);
      client.once('error', onError);
      client.once('close', onClose);
      client.once('offline', onOffline);
    });
  }

  _bindPersistentClientHandlers(client, endpoint, cid) {
    client.on('connect', () => {
      this.connected = true;
      this.activeEndpoint = endpoint;
      this._onConnected(endpoint, 'cookie-auth');
    });

    client.on('message', (topic, message) => {
      this._handleMessage(topic, message);
    });

    client.on('error', (err) => {
      log.error('Error:', err.message);
      this.emit('error', err);
    });

    client.on('close', () => {
      const wasConnected = this.connected;
      this.connected = false;
      this.subscribedTopics.clear();
      log.warn('Connection closed');
      if (wasConnected) {
        this.emit('disconnected');
      }
    });

    client.on('reconnect', () => {
      client.options.username = this._buildUsernamePayload({
        sid: this._generateSessionId(),
        cid
      });
      client.options.password = this._buildCookieHeader();
      client.options.wsOptions = {
        headers: this._buildWsHeaders(client.options.password)
      };
      // Pick the next backoff window for the *following* reconnect attempt.
      const nextDelay = this._nextReconnectDelay();
      client.options.reconnectPeriod = nextDelay;
      log.info(`Reconnecting... next attempt in ${nextDelay}ms (attempt ${this.reconnectAttempts})`);
      this.emit('reconnecting', { attempt: this.reconnectAttempts, delay: nextDelay });
    });

    client.on('offline', () => {
      log.warn('Client went offline');
    });
  }

  _onConnected(endpoint, profile) {
    log.info(`Connected to Instagram MQTT via ${endpoint} [${profile}]`);
    this._subscribeToTopics();
    this._requestIrisSync();
    this.emit('connected', { method: 'mqtt', endpoint, profile });
  }

  _subscribeToTopics() {
    const topics = [
      '/ig_realtime_sub',
      '/ig_sub_iris_response',
      '/ig_message_sync',
      '/ig_send_message_response',
      '/pubsub',
      '/t_region_hint',
      '/pp'
    ];

    // Only add user-scoped topics if userId is known
    if (this.userId) {
      topics.push(
        `/ig_realtime_sub/${this.userId}`,
        `/ig_sub_iris_response/${this.userId}`,
        `/ig_message_sync/${this.userId}`
      );
    }

    topics.forEach(topic => {
      if (this.subscribedTopics.has(topic)) {
        return;
      }

      this.mqttClient.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          log.error(`Failed to subscribe to ${topic}:`, err.message);
        } else {
          this.subscribedTopics.add(topic);
          log.silly(`Subscribed to ${topic}`);
        }
      });
    });
  }

  _requestIrisSync() {
    if (!this.mqttClient || !this.connected) {
      return;
    }

    const syncPayload = JSON.stringify({
      user_id: this.userId,
      seq_id: this.seqId,
      snapshot_at_ms: Date.now(),
      request_type: 'initial_sync'
    });

    this.mqttClient.publish('/ig_sub_iris', syncPayload, { qos: 1 }, (err) => {
      if (err) {
        log.warn(`Failed to request Iris sync: ${err.message}`);
      }
    });
  }

  // Any incoming packet = "something changed". Decode best-effort for debugging only.
  _handleMessage(topic, message) {
    let size = message ? message.length : 0;
    try {
      if (Buffer.isBuffer(message)) {
        for (const fn of [zlib.gunzipSync, zlib.inflateSync, zlib.inflateRawSync]) {
          try { size = fn(message).length; break; } catch (_) {}
        }
      }
    } catch (_) {}
    log.silly(`push on ${topic} (${size}b)`);
    this.emit('publish', { topic, size });
  }

  disconnect() {
    this.manualDisconnect = true;
    this.connectPromise = null;
    if (this.mqttClient) {
      try { this.mqttClient.removeAllListeners(); } catch (_) {}
      try { this.mqttClient.on('error', () => {}); } catch (_) {}
      try { this.mqttClient.end(true); } catch (_) {}
      this.mqttClient = null;
      this.connected = false;
      this.activeEndpoint = null;
      this.subscribedTopics.clear();
      log.info('Disconnected');
    }
  }

  isConnected() {
    return this.connected;
  }
}

module.exports = InstagramMQTTClient;
