'use strict';

const RobotMqttClient = require('./robot-mqtt');

/**
 * Push trigger backed by Tanvir143's realtime MQTT client (raw TLS, MQTToT).
 * Same contract as IcaMqttTrigger / WsMqttTrigger: start()/stop(), wakes `realtime`.
 *
 * Safety: polling is slowed only after a real PUBLISH arrives. If the socket
 * never delivers anything or drops, normal fast polling keeps running.
 * Reconnects with backoff on drop.
 */
class RobotMqttTrigger {
  constructor({ session, realtime, logger, safetyIntervalMs = 3000, maxInitialRetries = 8, userAgent, host, port, tls } = {}) {
    this.session = session;
    this.realtime = realtime;
    this.logger = logger || console;
    this.safetyIntervalMs = safetyIntervalMs;
    this.maxInitialRetries = maxInitialRetries;
    this.opts = { session, logger: this.logger, userAgent, host, port, tls };
    this.client = null;
    this.connected = false;
    this.verified = false;
    this.stopped = false;
    this.attempts = 0;
    this.retryTimer = null;
    this.mode = 'robot';
  }

  _log(level, msg) {
    const fn = this.logger && this.logger[level];
    if (typeof fn === 'function') fn.call(this.logger, `[MQTT/robot] ${msg}`);
  }

  async start() {
    if (this.stopped) return false;
    let c;
    try {
      c = new RobotMqttClient(this.opts);
    } catch (err) {
      this._log('warn', `robot MQTT unavailable (${err.message}); polling continues.`);
      return false;
    }
    this._detach();
    this.client = c;

    c.on('connected', () => {
      this.connected = true;
      this.verified = false;
      this.attempts = 0;
      this._log('info', 'Connected, waiting for first push before slowing polling.');
    });
    c.on('publish', () => this._onPush());
    c.on('disconnected', (reason) => this._onDown(reason));
    c.on('socket_error', (e) => this._log('debug', `socket error: ${e && e.message}`));

    try {
      await c.connect();
      return true;
    } catch (err) {
      this._log('warn', `connect failed (${err.message}); polling continues, retrying in background.`);
      try { c.disconnect(); } catch (_) {}
      this.client = null;
      this._scheduleRetry();
      return false;
    }
  }

  _detach() {
    if (this.client) {
      this.client.removeAllListeners();
    }
  }

  _onPush() {
    try {
      if (!this.verified) {
        this.verified = true;
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
    if (was && !this.stopped) {
      this._log('warn', `Push down (${reason}); back to normal polling, reconnecting.`);
      this._scheduleRetry(true);
    }
  }

  _scheduleRetry(fromDrop) {
    if (this.stopped || this.retryTimer) return;
    if (!fromDrop && this.attempts >= this.maxInitialRetries) {
      this._log('warn', `Giving up robot MQTT after ${this.attempts} tries; polling only.`);
      return;
    }
    this.attempts++;
    const delay = Math.min(300000, 15000 * Math.pow(2, Math.max(0, this.attempts - 1)));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.start().catch(() => {});
    }, delay);
  }

  async stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    try { this.realtime.setPushActive(false); } catch (_) {}
    this._detach();
    try { if (this.client) this.client.disconnect(); } catch (_) {}
    this.client = null;
  }
}

module.exports = RobotMqttTrigger;
