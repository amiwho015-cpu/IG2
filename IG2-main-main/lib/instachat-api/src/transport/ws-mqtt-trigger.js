'use strict';

const WsMqttClient = require('./ws-mqtt');

/**
 * Push trigger backed by the native WebSocket MQTT client (ported from insta-chat-api).
 * Same contract as `MqttTrigger`: start()/stop(), wakes `realtime` on pushes.
 *
 * Safety: polling is only slowed down once a real PUBLISH push has been received from
 * Instagram. If the socket opens but nothing is ever pushed (e.g. the server ignores the
 * handshake), the bot simply keeps its normal fast polling, so it never gets worse.
 */
class WsMqttTrigger {
  constructor({ session, realtime, logger, safetyIntervalMs = 30000, maxReconnects = 7, topics, url } = {}) {
    this.session = session;
    this.realtime = realtime;
    this.logger = logger || console;
    this.safetyIntervalMs = safetyIntervalMs;
    this.client = new WsMqttClient({ session, logger, maxReconnects, topics, url });
    this.connected = false; // socket open
    this.verified = false;  // at least one real push seen on this connection
    this.stopped = false;
    this.mode = 'native';
  }

  _log(level, msg) {
    const fn = this.logger && this.logger[level];
    if (typeof fn === 'function') fn.call(this.logger, `[MQTT/ws] ${msg}`);
  }

  async start() {
    const c = this.client;

    c.on('publish', () => this._onPush());
    c.on('open', () => {
      this.connected = true;
      this.verified = false;
      this._log('info', 'WebSocket connected, waiting for first push before slowing polling.');
    });
    c.on('close', () => this._onDown('connection closed'));
    c.on('error', (e) => this._log('debug', `socket error: ${e && e.message}`));
    c.on('giveup', () => this._log('warn', 'Instagram closes the socket without pushing (the ported MQTT handshake is incomplete). Giving up; polling only. Try instachat.mqttMode "library".'));

    try {
      await c.connect();
      return true;
    } catch (err) {
      this._log('warn', `connect failed (${err.message}); polling continues, will retry in background.`);
      c._scheduleReconnect();
      return false;
    }
  }

  _onPush() {
    try {
      if (!this.verified) {
        this.verified = true;
        this.client.attempts = 0;
        this.realtime.setPushActive(true, this.safetyIntervalMs);
        this._log('info', `Push verified; polling slowed to ${Math.round(this.safetyIntervalMs / 1000)}s safety net.`);
      }
      this.realtime.wake();
    } catch (_) { /* never break the bot */ }
  }

  _onDown(reason) {
    const was = this.connected;
    this.connected = false;
    this.verified = false;
    try { this.realtime.setPushActive(false); } catch (_) {}
    if (was && !this.stopped) this._log('warn', `Push down (${reason}); back to normal polling.`);
  }

  async stop() {
    this.stopped = true;
    try { this.realtime.setPushActive(false); } catch (_) {}
    try { await this.client.disconnect(); } catch (_) {}
  }
}

module.exports = WsMqttTrigger;
