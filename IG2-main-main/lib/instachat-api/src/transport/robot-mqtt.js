'use strict';

/**
 * Instagram realtime MQTT client ported from Tanvir143 (IG-ROBOT / tanvir-mqtt).
 *
 *  - raw TLS socket to edge-mqtt.facebook.com:443 (MQTToT protocol, thrift CONNECT)
 *  - cookie auth: password = "sessionid=..." and appSpecificInfo like the Android app
 *  - keep-alive PINGREQ every 15s, reconnect is handled by RobotMqttTrigger
 *  - after CONNACK: foreground state + Iris sync request
 *  - every incoming PUBLISH is reported as 'publish' (used as a push signal)
 *
 * Only Node built-ins are needed (net, tls, zlib, crypto). No npm packages.
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const net = require('net');
const tls = require('tls');
const mqttot = require('./robot-mqttot');

const REALTIME_HOST = 'edge-mqtt.facebook.com';
const REALTIME_PORT = 443;
const REALTIME_APP_ID = 567067343352427;
const SUBSCRIBE_TOPICS = [88, 135, 149, 150, 133, 146];
const KEEPALIVE_SEC = 20;
const PING_EVERY_MS = 15000;
const PONG_TIMEOUT_MS = 45000;
const DEFAULT_APP_VERSION = '350.0.0.0.0';
const DEFAULT_UA =
  'Instagram 350.0.0.0.0 Android (28/8.1.0; 480dpi; 1080x1920; Google; Pixel 2; walleye; qcom; en_US; 143991798)';
const EVERCLEAR = {
  inapp_notification_subscribe_comment: '17899377895239777',
  inapp_notification_subscribe_comment_mention_and_reply: '17899377895239777',
  video_call_participant_state_delivery: '17977239895057311',
  presence_subscribe: '17846944882223835',
};

function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

class RobotMqttClient extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {Object} opts.session  IG2 session ({ cookies, userId })
   * @param {Object} [opts.logger]
   * @param {string} [opts.host]   default edge-mqtt.facebook.com
   * @param {number} [opts.port]   default 443
   * @param {boolean} [opts.tls]   default true (tests use false)
   * @param {string} [opts.userAgent]
   * @param {string} [opts.appVersion]
   * @param {string} [opts.locale]
   */
  constructor(opts = {}) {
    super();
    const session = opts.session || {};
    const cookies = session.cookies || {};
    this.logger = opts.logger || console;
    this.host = opts.host || REALTIME_HOST;
    this.port = opts.port || REALTIME_PORT;
    this.useTls = opts.tls !== false;
    this.userId = String(session.userId || cookies.ds_user_id || cookies.userid || '');
    this.sessionid = cookies.sessionid || '';
    if (!this.sessionid || !this.userId) {
      throw new Error('robot-mqtt: sessionid and ds_user_id cookies are required');
    }
    this.userAgent = opts.userAgent || DEFAULT_UA;
    this.appVersion = opts.appVersion || DEFAULT_APP_VERSION;
    this.locale = opts.locale || 'en_US';
    this.getIrisState = typeof opts.getIrisState === 'function' ? opts.getIrisState : null;
    this.lastSeqId = null;
    this.phoneId = opts.phoneId || uuid();
    this.deviceId = this.phoneId;

    this.socket = null;
    this.connected = false;
    this.packetId = 0;
    this.buf = Buffer.alloc(0);
    this.pingTimer = null;
    this.lastPong = 0;
    this._connackWaiter = null;
  }

  _log(level, msg) {
    const fn = this.logger && this.logger[level];
    if (typeof fn === 'function') fn.call(this.logger, `[MQTT/robot] ${msg}`);
  }

  _buildConnection() {
    return {
      clientIdentifier: String(this.phoneId).slice(0, 20),
      clientInfo: {
        userId: Number(this.userId),
        userAgent: this.userAgent,
        clientCapabilities: 183,
        endpointCapabilities: 0,
        publishFormat: 1,
        noAutomaticForeground: false,
        makeUserAvailableInForeground: true,
        deviceId: this.deviceId,
        isInitiallyForeground: true,
        networkType: 1,
        networkSubtype: 0,
        clientMqttSessionId: Date.now() & 0xffffffff,
        subscribeTopics: SUBSCRIBE_TOPICS,
        clientType: 'cookie_auth',
        appId: REALTIME_APP_ID,
        deviceSecret: '',
        clientStack: 3,
      },
      password: 'sessionid=' + this.sessionid,
      appSpecificInfo: {
        app_version: this.appVersion,
        'X-IG-Capabilities': '3brTv10=',
        everclear_subscriptions: JSON.stringify(EVERCLEAR),
        'User-Agent': this.userAgent,
        'Accept-Language': String(this.locale).replace('_', '-'),
        platform: 'android',
        ig_mqtt_route: 'django',
        pubsub_msg_type_blacklist: 'direct, typing_type',
        auth_cache_enabled: '0',
      },
    };
  }

  /** Opens the socket, sends CONNECT and waits for CONNACK. Resolves when connected. */
  connect() {
    return new Promise((resolve, reject) => {
      const onSocketError = (err) => reject(err);
      const open = this.useTls
        ? tls.connect({ host: this.host, port: this.port, minVersion: 'TLSv1.2', servername: this.host })
        : net.connect({ host: this.host, port: this.port });
      this.socket = open;
      open.once('error', onSocketError);
      open.once(this.useTls ? 'secureConnect' : 'connect', () => {
        open.removeListener('error', onSocketError);
        open.on('data', (chunk) => this._onData(chunk));
        open.on('error', (err) => this.emit('socket_error', err));
        open.on('close', () => this._onClose());
        this.buf = Buffer.alloc(0);

        this._connackWaiter = { resolve, reject };
        const timer = setTimeout(() => {
          if (this._connackWaiter) {
            this._connackWaiter = null;
            reject(new Error('robot-mqtt: CONNACK timeout'));
            this.disconnect();
          }
        }, 20000);
        this._connackTimer = timer;
        this._send(mqttot.connectPacket(this._buildConnection(), KEEPALIVE_SEC)).catch(reject);
      });
    });
  }

  _send(buf) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        return reject(new Error('robot-mqtt: socket not open'));
      }
      this.socket.write(buf, (err) => (err ? reject(err) : resolve()));
    });
  }

  _nextPacketId() {
    this.packetId = (this.packetId % 65535) + 1;
    return this.packetId;
  }

  _onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    // Parse as many complete MQTT frames as we have.
    for (;;) {
      if (this.buf.length < 2) return;
      let multiplier = 1;
      let remaining = 0;
      let i = 1;
      let complete = false;
      for (; i < this.buf.length && i <= 4; i++) {
        const digit = this.buf[i];
        remaining += (digit & 0x7f) * multiplier;
        multiplier *= 128;
        if ((digit & 0x80) === 0) {
          complete = true;
          i++;
          break;
        }
      }
      if (!complete) return;
      const total = i + remaining;
      if (this.buf.length < total) return;
      const frame = this.buf.slice(0, total);
      this.buf = this.buf.slice(total);
      this._handleFrame(frame);
    }
  }

  _handleFrame(frame) {
    let packet;
    try {
      packet = mqttot.decodePacket(frame);
    } catch (err) {
      this._log('debug', `bad frame: ${err.message}`);
      return;
    }

    if (packet.packetType === 'connack') {
      if (this._connackTimer) clearTimeout(this._connackTimer);
      const waiter = this._connackWaiter;
      this._connackWaiter = null;
      if (packet.returnCode !== 0) {
        const err = new Error('robot-mqtt: CONNACK refused, code ' + packet.returnCode);
        this.disconnect();
        if (waiter) waiter.reject(err);
        return;
      }
      this.connected = true;
      this.lastPong = Date.now();
      this._startPing();
      this._afterConnect()
        .then(() => {
          this.emit('connected', { userId: this.userId });
          if (waiter) waiter.resolve();
        })
        .catch((err) => {
          this._log('warn', `post-connect setup failed: ${err.message}`);
          if (waiter) waiter.reject(err);
        });
      return;
    }

    if (packet.packetType === 'publish') {
      if (packet.qos === 1 && packet.packetId !== null) {
        this._send(mqttot.pubackPacket(packet.packetId)).catch(() => {});
      }
      let body = null;
      try {
        const raw = mqttot.tryDecompress(packet.payload);
        body = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw));
      } catch (_) { body = null; }
      if (packet.topic === mqttot.TOPICS.MESSAGE_SYNC && body) {
        const list = Array.isArray(body) ? body : [body];
        for (const it of list) {
          if (it && it.seq_id !== undefined && it.seq_id !== null) this.lastSeqId = Number(it.seq_id);
        }
      }
      this.emit('publish', { topic: String(packet.topic), payload: body });
      return;
    }

    if (packet.packetType === 'pingresp') {
      this.lastPong = Date.now();
      return;
    }
  }

  async _afterConnect() {
    // Foreground state, then Iris sync with the real inbox seq_id/snapshot (falls back to 0 = initial sync).
    const fg = Buffer.concat([
      Buffer.from([0x00]),
      mqttot.writeThrift(
        { inForegroundApp: true, inForegroundDevice: true, keepAliveTimeout: 60 },
        [
          { name: 'inForegroundApp', field: 1, type: mqttot.THRIFT.BOOLEAN },
          { name: 'inForegroundDevice', field: 2, type: mqttot.THRIFT.BOOLEAN },
          { name: 'keepAliveTimeout', field: 3, type: mqttot.THRIFT.INT32 },
        ]
      ),
    ]);
    await this._publish(mqttot.TOPICS.FOREGROUND_STATE, mqttot.compress(fg));

    // Real sync position (like Tanvir143's directSubscribe) so Instagram pushes message_sync.
    let seqId = 0, snapshotAtMs = 0;
    if (this.getIrisState) {
      try {
        const st = await this.getIrisState();
        if (st && Number.isFinite(st.seqId) && Number.isFinite(st.snapshotAtMs)) {
          seqId = st.seqId; snapshotAtMs = st.snapshotAtMs; this.lastSeqId = seqId;
        }
      } catch (err) { this._log('warn', `iris state unavailable (${err.message}); using initial sync`); }
    }
    if (!seqId && this.getIrisState && !this._irisRetryTimer && (this._irisRetries || 0) < 5) {
      // Real position not available yet (e.g. account prompt pending): try again shortly.
      this._irisRetryTimer = setTimeout(() => {
        this._irisRetryTimer = null;
        this._irisRetries = (this._irisRetries || 0) + 1;
        if (this.connected) this._afterConnect().catch(() => {});
      }, 30000);
      if (this._irisRetryTimer.unref) this._irisRetryTimer.unref();
    }
    const iris = { seq_id: seqId, snapshot_at_ms: snapshotAtMs, snapshot_app_version: this.appVersion };
    await this._publish(mqttot.TOPICS.IRIS_SUB, mqttot.compress(Buffer.from(JSON.stringify(iris), 'utf8')));
  }

  _publish(topic, payload) {
    return this._send(mqttot.publishPacket(topic, payload, 1, this._nextPacketId()));
  }

  _startPing() {
    this._stopPing();
    this.pingTimer = setInterval(() => {
      if (Date.now() - this.lastPong > PONG_TIMEOUT_MS) {
        this._log('warn', 'no PINGRESP, dropping socket');
        this.disconnect();
        return;
      }
      this._send(mqttot.pingreqPacket()).catch(() => {});
    }, PING_EVERY_MS);
    if (this.pingTimer.unref) this.pingTimer.unref();
  }

  _stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  _onClose() {
    const was = this.connected;
    this.connected = false;
    this._stopPing();
    if (this._connackWaiter) {
      const waiter = this._connackWaiter;
      this._connackWaiter = null;
      waiter.reject(new Error('robot-mqtt: socket closed before CONNACK'));
    }
    if (was) this.emit('disconnected', 'socket closed');
  }

  disconnect() {
    this._stopPing();
    if (this._irisRetryTimer) { clearTimeout(this._irisRetryTimer); this._irisRetryTimer = null; }
    const sock = this.socket;
    this.socket = null;
    if (sock) {
      try {
        if (this.connected) sock.write(mqttot.disconnectPacket());
      } catch (_) {}
      try { sock.destroy(); } catch (_) {}
    }
    this.connected = false;
  }
}

module.exports = RobotMqttClient;
