'use strict';

/**
 * Native Instagram MQTT-over-WebSocket client.
 *
 * Ported from `insta-chat-api` (src/core/mqtt-client.ts) to plain CommonJS and hardened:
 *   - correct MQTT variable-length encoding/decoding (supports packets > 127 bytes)
 *   - several MQTT packets per WebSocket frame are handled
 *   - exponential reconnect backoff instead of a fixed 5s loop
 *   - emits events instead of requiring topic callbacks only
 *
 * Needs only the `ws` package and the bot's own cookies (cookie auth).
 */

const EventEmitter = require('events');

const DEFAULT_TOPICS = [
  '/ig_message_sync',
  '/ig_send_message_response',
  '/ig_typing_indicator',
  '/ig_sub_iris_response',
  '/pubsub'
];

const EDGE_CHAT_HOST = 'edge-chat.instagram.com';

// CONNECT parameter variants tried in order when the server rejects the handshake.
// sid: 'user' = part of sessionid before '%', 'rand' = random int (Messenger-web style)
// proto: 'v3' = MQIsdp level 3, 'v4' = MQTT level 4; pass: send password field
const VARIANTS = [
  { name: 'A user-sid/v3/pass', sid: 'user', proto: 'v3', pass: true },
  { name: 'B rand-sid/v3/pass', sid: 'rand', proto: 'v3', pass: true },
  { name: 'C rand-sid/v4/pass', sid: 'rand', proto: 'v4', pass: true },
  { name: 'D rand-sid/v3/no-pass', sid: 'rand', proto: 'v3', pass: false },
  { name: 'E user-sid/v4/no-pass', sid: 'user', proto: 'v4', pass: false }
];

function encodeRemainingLength(len) {
  const bytes = [];
  do {
    let digit = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) digit |= 0x80;
    bytes.push(digit);
  } while (len > 0);
  return Buffer.from(bytes);
}

function decodeRemainingLength(buf, offset) {
  let multiplier = 1;
  let value = 0;
  let pos = offset;
  let byte;
  do {
    if (pos >= buf.length) return null; // incomplete
    byte = buf[pos++];
    value += (byte & 127) * multiplier;
    multiplier *= 128;
    if (multiplier > 128 * 128 * 128 * 128) return null;
  } while ((byte & 128) !== 0);
  return { value, next: pos };
}

class WsMqttClient extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.session  - Session with `.cookies` map (needs `sessionid`)
   * @param {Object} [options.logger]
   * @param {string[]} [options.topics]
   * @param {number} [options.pingIntervalMs=30000]
   * @param {number} [options.connectTimeoutMs=15000]
   * @param {number} [options.maxReconnects=Infinity]
   * @param {string} [options.userAgent]
   */
  constructor(options = {}) {
    super();
    this.session = options.session;
    this.logger = options.logger || null;
    this.topics = options.topics || DEFAULT_TOPICS;
    this.pingIntervalMs = options.pingIntervalMs || 30000;
    this.connectTimeoutMs = options.connectTimeoutMs || 15000;
    this.maxReconnects = options.maxReconnects == null ? Infinity : options.maxReconnects;
    this.urlOverride = options.url || null; // testing only
    this.appId = options.appId || 936619743392459; // Instagram web app id
    this.userAgent = options.userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

    this.ws = null;
    this.stopped = false;
    this.connecting = false;
    this.attempts = 0;
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.packetId = 0;
    this.handlers = new Map(); // topic -> Function[]
    this.buffer = Buffer.alloc(0);
    this.variantIdx = Number(options.variant) || 0;
    this.randSid = 0;
    this.fastRetry = false;
  }

  _log(level, msg) {
    const fn = this.logger && this.logger[level];
    if (typeof fn === 'function') fn.call(this.logger, `[WS-MQTT] ${msg}`);
  }

  isConnected() {
    return !!this.ws && this.ws.readyState === 1;
  }

  _buildUrlAndHeaders() {
    const cookies = (this.session && this.session.cookies) || {};
    if (!cookies.sessionid) throw new Error('Missing sessionid cookie for MQTT');

    // Same as the source library: use the part of the cookie before the first '%'.
    const v = VARIANTS[this.variantIdx % VARIANTS.length];
    this.randSid = Math.floor(Math.random() * 2147483647);
    const sidParam = v.sid === 'rand' ? String(this.randSid) : String(cookies.sessionid).split('%')[0];
    const cid = cookies.ig_did || `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    const cookieHeader = Object.entries(cookies)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    return {
      url: this.urlOverride || `wss://${EDGE_CHAT_HOST}/chat?sid=${sidParam}&cid=${encodeURIComponent(cid)}`,
      headers: {
        Host: EDGE_CHAT_HOST,
        'User-Agent': this.userAgent,
        Origin: 'https://www.instagram.com',
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: cookieHeader
      }
    };
  }

  async connect() {
    if (this.stopped) return;
    if (this.connecting || this.isConnected()) return;

    let WebSocket;
    try {
      WebSocket = require('ws');
    } catch (err) {
      throw new Error(`'ws' package is not installed (npm i ws): ${err.message}`);
    }

    this.connecting = true;
    const { url, headers } = this._buildUrlAndHeaders();
    this._log('debug', `Connecting to ${EDGE_CHAT_HOST}...`);

    await new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url, { headers });
      this.ws = ws;
      this.buffer = Buffer.alloc(0);

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.connecting = false;
        try { ws.terminate(); } catch (_) {}
        reject(new Error('Connection timeout'));
      }, this.connectTimeoutMs);

      ws.on('open', () => {
        clearTimeout(timeout);
        this.connecting = false;
        // attempts is reset by the trigger only after a real push is received, so a socket
        // that opens and is immediately closed by the server keeps backing off.
        this._startPing();
        this._sendConnect();
        this.emit('open');
        if (!settled) { settled = true; resolve(); }
      });

      ws.on('message', (data) => {
        try { this._onData(Buffer.isBuffer(data) ? data : Buffer.from(data)); }
        catch (err) { this._log('debug', `parse error: ${err.message}`); }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        this.connecting = false;
        this.emit('error', err);
        if (!settled) { settled = true; reject(err); }
      });

      ws.on('close', (code) => {
        clearTimeout(timeout);
        this.connecting = false;
        this._stopPing();
        this.emit('close', code);
        if (!settled) { settled = true; reject(new Error(`closed before open (${code})`)); }
        this._scheduleReconnect();
      });
    });
  }

  _scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    if (this.attempts >= this.maxReconnects) {
      this._log('warn', `Giving up after ${this.attempts} reconnect attempts.`);
      this.emit('giveup');
      return;
    }
    this.attempts++;
    const delay = this.fastRetry ? 3000 : Math.min(300000, 5000 * Math.pow(2, this.attempts - 1));
    this.fastRetry = false;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((e) => this._log('debug', `reconnect failed: ${e.message}`));
    }, delay);
  }

  _startPing() {
    this._stopPing();
    this.pingTimer = setInterval(() => {
      if (this.isConnected()) {
        try { this.ws.send(Buffer.from([0xc0, 0x00])); } catch (_) {} // PINGREQ
      }
    }, this.pingIntervalMs);
    if (this.pingTimer.unref) this.pingTimer.unref();
  }

  _stopPing() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  _nextPacketId() {
    this.packetId = (this.packetId % 65535) + 1;
    return this.packetId;
  }

  _buildSubscribePacket(topic) {
    const topicBytes = Buffer.from(topic, 'utf8');
    const id = this._nextPacketId();
    const body = Buffer.concat([
      Buffer.from([(id >> 8) & 0xff, id & 0xff]),
      Buffer.from([(topicBytes.length >> 8) & 0xff, topicBytes.length & 0xff]),
      topicBytes,
      Buffer.from([0x01]) // QoS 1
    ]);
    return Buffer.concat([Buffer.from([0x82]), encodeRemainingLength(body.length), body]);
  }

  _buildPublishPacket(topic, payload) {
    const topicBytes = Buffer.from(topic, 'utf8');
    const payloadBytes = Buffer.from(payload, 'utf8');
    const body = Buffer.concat([
      Buffer.from([(topicBytes.length >> 8) & 0xff, topicBytes.length & 0xff]),
      topicBytes,
      payloadBytes
    ]);
    return Buffer.concat([Buffer.from([0x30]), encodeRemainingLength(body.length), body]);
  }

  _str(v) {
    const b = Buffer.from(String(v), 'utf8');
    return Buffer.concat([Buffer.from([(b.length >> 8) & 0xff, b.length & 0xff]), b]);
  }

  /**
   * MQTT 3.1 (MQIsdp) CONNECT with Instagram-web style JSON in the username field
   * (same scheme Facebook/Messenger web clients use over edge-chat). EXPERIMENTAL.
   */
  _sendConnect() {
    const cookies = (this.session && this.session.cookies) || {};
    const userId = String(this.session.userId || cookies.ds_user_id || '');
    const deviceId = cookies.ig_did || `${Date.now()}`;
    const v = VARIANTS[this.variantIdx % VARIANTS.length];
    const info = {
      u: userId,
      s: v.sid === 'rand' ? this.randSid : Math.floor(Math.random() * 0xffffffff),
      chat_on: true,
      fg: true,
      d: deviceId,
      ct: 'websocket',
      aid: this.appId,
      mqtt_sid: '',
      cp: 3,
      ecp: 10,
      st: this.topics,
      pm: [],
      dc: '',
      no_auto_fg: true,
      gas: null,
      pack: [],
      a: this.userAgent,
      aids: null
    };
    const keepAlive = 60;
    const flags = v.pass ? 0xc2 : 0x82; // user[+pass]+clean session
    const varHeader = Buffer.concat([
      this._str(v.proto === 'v4' ? 'MQTT' : 'MQIsdp'),
      Buffer.from([v.proto === 'v4' ? 4 : 3, flags, (keepAlive >> 8) & 0xff, keepAlive & 0xff])
    ]);
    const parts = [this._str('mqttwsclient'), this._str(JSON.stringify(info))];
    if (v.pass) parts.push(this._str(`sessionid=${(cookies.sessionid || '')}`));
    const payload = Buffer.concat(parts);
    const body = Buffer.concat([varHeader, payload]);
    this.ws.send(Buffer.concat([Buffer.from([0x10]), encodeRemainingLength(body.length), body]));
    this._log('info', `CONNECT sent (variant ${v.name})`);
  }

  _subscribeAll() {
    for (const topic of this.topics) {
      try { this.ws.send(this._buildSubscribePacket(topic)); }
      catch (err) { this._log('debug', `subscribe ${topic} failed: ${err.message}`); }
    }
  }

  /** Parses every complete MQTT packet inside the buffered stream. */
  _onData(chunk) {
    this.emit('frame', chunk); // any inbound traffic proves the socket is alive
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;

    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const rl = decodeRemainingLength(this.buffer, 1);
      if (!rl) break; // need more bytes
      const end = rl.next + rl.value;
      if (this.buffer.length < end) break;

      const packet = this.buffer.slice(rl.next, end);
      this.buffer = this.buffer.slice(end);
      this._handlePacket(first, packet);
    }
    if (this.buffer.length > 1024 * 1024) this.buffer = Buffer.alloc(0); // safety
  }

  _handlePacket(firstByte, body) {
    const type = (firstByte >> 4) & 0x0f;
    if (type === 3) { // PUBLISH
      const qos = (firstByte >> 1) & 0x03;
      if (body.length < 2) return;
      const topicLen = (body[0] << 8) | body[1];
      let pos = 2;
      const topic = body.slice(pos, pos + topicLen).toString('utf8');
      pos += topicLen;
      let packetId = null;
      if (qos > 0) { packetId = (body[pos] << 8) | body[pos + 1]; pos += 2; }
      const payload = body.slice(pos);

      if (qos === 1 && packetId != null && this.isConnected()) {
        try { this.ws.send(Buffer.from([0x40, 0x02, (packetId >> 8) & 0xff, packetId & 0xff])); } catch (_) {} // PUBACK
      }

      let data = null;
      try { data = JSON.parse(payload.toString('utf8')); } catch (_) { /* binary / non-JSON */ }
      this.emit('publish', { topic, data, raw: payload });
      this._trigger(topic, data !== null ? data : payload);
      this._trigger('*', { topic, data: data !== null ? data : payload });
    } else if (type === 2) { // CONNACK
      const code = body.length > 1 ? body[1] : -1;
      const vn = VARIANTS[this.variantIdx % VARIANTS.length].name;
      this._log(code === 0 ? 'info' : 'warn', `CONNACK return code ${code}${code === 0 ? ` (accepted, variant ${vn})` : ` (rejected, variant ${vn})`}`);
      this.emit('connack', code);
      if (code === 0) {
        this._subscribeAll();
      } else {
        this.variantIdx = (this.variantIdx + 1) % VARIANTS.length;
        this.fastRetry = true;
        try { this.ws.terminate(); } catch (_) {}
      }
    } else if (type === 9) { // SUBACK
      this.emit('suback', body);
    } else if (type === 13) { // PINGRESP
      this.emit('pong');
    }
  }

  _trigger(topic, data) {
    const list = this.handlers.get(topic);
    if (!list) return;
    for (const h of list.slice()) {
      try { h(data); } catch (err) { this._log('debug', `handler error: ${err.message}`); }
    }
  }

  /** Topic callback API (same shape as insta-chat-api: on('/ig_message_sync', cb), on('*', cb)). */
  onTopic(topic, cb) {
    if (!this.handlers.has(topic)) this.handlers.set(topic, []);
    this.handlers.get(topic).push(cb);
    return this;
  }

  offTopic(topic, cb) {
    if (!cb) { this.handlers.delete(topic); return this; }
    const list = this.handlers.get(topic);
    if (list) {
      const i = list.indexOf(cb);
      if (i > -1) list.splice(i, 1);
    }
    return this;
  }

  /** Sends a typing indicator over the socket (ported from insta-chat-api). */
  sendTypingIndicator(threadId, isTyping = true) {
    if (!this.isConnected()) return false;
    const payload = JSON.stringify({
      thread_id: String(threadId),
      activity_status: isTyping ? '1' : '0',
      client_context: Date.now().toString()
    });
    this.ws.send(this._buildPublishPacket('/ig_typing_indicator', payload));
    return true;
  }

  async disconnect() {
    this.stopped = true;
    this._stopPing();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    await new Promise((resolve) => {
      const t = setTimeout(() => { try { ws.terminate(); } catch (_) {} resolve(); }, 2000);
      ws.once('close', () => { clearTimeout(t); resolve(); });
      try { ws.close(); } catch (_) { clearTimeout(t); resolve(); }
    });
  }
}

WsMqttClient.DEFAULT_TOPICS = DEFAULT_TOPICS;
WsMqttClient.VARIANTS = VARIANTS;
WsMqttClient.encodeRemainingLength = encodeRemainingLength;
WsMqttClient.decodeRemainingLength = decodeRemainingLength;

module.exports = WsMqttClient;
