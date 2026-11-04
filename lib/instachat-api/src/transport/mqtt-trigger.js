'use strict';

/**
 * Optional Instagram Realtime (MQTT) push trigger.
 *
 * Uses the community `instagram_mqtt` + `instagram-private-api` packages (both optional).
 * MQTT is ONLY a wake-up signal: when Instagram pushes "something changed", we call
 * `realtime.wake()` and the normal, well-tested polling code fetches + parses everything.
 * While MQTT is connected, regular polling slows to a safety-net interval.
 * If anything fails (packages missing, bad cookies, disconnect) we silently fall back to
 * normal fast polling, so the bot never gets worse than before.
 *
 * Enable with config `mqtt: true` or env `IG_MQTT=1`.
 */
class MqttTrigger {
  constructor({ session, realtime, logger, proxy = null, safetyIntervalMs = 30000, maxReconnects = 5 }) {
    this.session = session;
    this.realtime = realtime;
    this.logger = logger || console;
    this.proxy = proxy;
    this.safetyIntervalMs = safetyIntervalMs;
    this.maxReconnects = maxReconnects;
    this.ig = null;
    this.connected = false;
    this.stopped = false;
    this.attempts = 0;
    this.reconnectTimer = null;
  }

  _log(level, msg) {
    const fn = this.logger && this.logger[level];
    if (typeof fn === 'function') fn.call(this.logger, `[MQTT] ${msg}`);
  }

  async start() {
    let IgApiClient, mqttLib;
    try {
      ({ IgApiClient } = require('instagram-private-api'));
      mqttLib = require('instagram_mqtt');
    } catch (err) {
      this._log('warn', `instagram_mqtt / instagram-private-api not installed, staying on polling (${err.message})`);
      return false;
    }
    return this._connect(IgApiClient, mqttLib);
  }

  async _connect(IgApiClient, mqttLib) {
    if (this.stopped) return false;
    try {
      const { withRealtime, SkywalkerSubscriptions } = mqttLib;
      const ig = withRealtime(new IgApiClient());
      this.ig = ig;

      // Same account: reuse the bot's own cookies (cookie-auth, no password login).
      ig.state.generateDevice(String(this.session.username || this.session.userId || 'instabot'));
      if (this.proxy) ig.state.proxyUrl = this.proxy;
      const jar = ig.state.cookieJar;
      for (const [name, value] of Object.entries(this.session.cookies || {})) {
        if (!value) continue;
        const str = `${name}=${value}; Domain=.instagram.com; Path=/; Secure`;
        if (typeof jar.setCookieSync === 'function') jar.setCookieSync(str, 'https://i.instagram.com/');
        else await jar.setCookie(str, 'https://i.instagram.com/');
      }

      const userId = String(this.session.userId || this.session.cookies.ds_user_id);
      const irisData = await ig.feed.directInbox().request();

      ig.realtime.on('message', () => this._onPush());
      ig.realtime.on('iris', () => this._onPush());
      ig.realtime.on('error', (e) => this._onDown(`error: ${e && e.message}`));
      ig.realtime.on('close', () => this._onDown('connection closed'));

      await ig.realtime.connect({
        skywalkerSubs: [SkywalkerSubscriptions.directSub(userId)],
        irisData
      });

      this.connected = true;
      this.attempts = 0;
      this.realtime.setPushActive(true, this.safetyIntervalMs);
      this._log('info', `Realtime push connected; polling slowed to ${Math.round(this.safetyIntervalMs / 1000)}s safety net.`);
      return true;
    } catch (err) {
      this._onDown(`connect failed: ${err && err.message}`);
      return false;
    }
  }

  _onPush() {
    try { this.realtime.wake(); } catch (_) { /* never break the bot */ }
  }

  _onDown(reason) {
    const wasConnected = this.connected;
    this.connected = false;
    this.realtime.setPushActive(false); // back to normal fast polling immediately
    if (wasConnected) this._log('warn', `Push down (${reason}); back to normal polling.`);
    else this._log('warn', reason);
    this._scheduleReconnect();
  }

  _scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    if (this.attempts >= this.maxReconnects) {
      this._log('warn', `Giving up MQTT after ${this.attempts} tries; polling only.`);
      return;
    }
    this.attempts++;
    const delay = Math.min(300000, 30000 * Math.pow(2, this.attempts - 1));
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try { if (this.ig && this.ig.realtime) await this.ig.realtime.disconnect(); } catch (_) {}
      await this.start();
    }, delay);
  }

  async stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.realtime.setPushActive(false);
    try { if (this.ig && this.ig.realtime) await this.ig.realtime.disconnect(); } catch (_) {}
  }
}

module.exports = MqttTrigger;
