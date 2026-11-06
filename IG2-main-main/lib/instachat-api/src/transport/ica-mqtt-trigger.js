'use strict';

const InstagramMQTTClient = require('./ica-mqtt');

/**
 * Push trigger backed by InstaBOT's MQTT client (mqtt library over wss://edge-chat.instagram.com).
 * Same contract as WsMqttTrigger / MqttTrigger: start()/stop(), wakes `realtime` on pushes.
 *
 * Safety: polling is only slowed down once a real packet has been pushed by Instagram.
 * If the socket connects but nothing arrives, or it drops, normal fast polling continues,
 * so the bot never gets worse than plain polling.
 */
class IcaMqttTrigger {
  constructor({ session, realtime, logger, safetyIntervalMs = 3000, maxInitialRetries = 8 } = {}) {
    this.session = session;
    this.realtime = realtime;
    this.logger = logger || console;
    this.safetyIntervalMs = safetyIntervalMs;
    this.maxInitialRetries = maxInitialRetries;
    this.client = null;
    this.connected = false;
    this.verified = false;
    this.stopped = false;
    this.attempts = 0;
    this.retryTimer = null;
    this.mode = 'ica';
  }

  _log(level, msg) {
    const fn = this.logger && this.logger[level];
    if (typeof fn === 'function') fn.call(this.logger, `[MQTT/ica] ${msg}`);
  }

  async start() {
    if (this.stopped) return false;
    let c;
    try {
      c = new InstagramMQTTClient({ session: this.session, logger: this.logger });
    } catch (err) {
      // `mqtt` / `duplexify` / `ws` not installed -> stay on polling (auto mode falls back)
      this._log('warn', `ICA MQTT unavailable (${err.message}); polling continues. Run: npm i mqtt duplexify ws`);
      return false;
    }
    this.client = c;

    c.on('connected', () => {
      this.connected = true;
      this.verified = false;
      this.attempts = 0;
      this._log('info', 'Connected, waiting for first push before slowing polling.');
    });
    c.on('publish', () => this._onPush());
    c.on('disconnected', () => this._onDown('connection closed'));
    c.on('error', (e) => this._log('debug', `socket error: ${e && e.message}`));

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
    if (was && !this.stopped) this._log('warn', `Push down (${reason}); back to normal polling. The MQTT client reconnects by itself.`);
  }

  _scheduleRetry() {
    if (this.stopped || this.retryTimer) return;
    if (this.attempts >= this.maxInitialRetries) {
      this._log('warn', `Giving up ICA MQTT after ${this.attempts} tries; polling only.`);
      return;
    }
    this.attempts++;
    const delay = Math.min(300000, 15000 * Math.pow(2, this.attempts - 1));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.start().catch(() => {});
    }, delay);
  }

  async stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    try { this.realtime.setPushActive(false); } catch (_) {}
    try { if (this.client) this.client.disconnect(); } catch (_) {}
  }
}

module.exports = IcaMqttTrigger;
