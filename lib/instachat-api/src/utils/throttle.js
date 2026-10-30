'use strict';

/**
 * Outgoing send throttle.
 * Spaces out write actions (messages, uploads, reactions) with a minimum gap plus
 * random jitter, globally and per thread, so traffic looks less machine-like and
 * the account is less likely to hit Instagram action blocks.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SendThrottle {
  /**
   * @param {Object|boolean} [options]
   * @param {number} [options.minGapMs=700]        Min gap between any two sends.
   * @param {number} [options.perThreadGapMs=1200] Min gap between sends to the same thread.
   * @param {number} [options.jitterMs=300]        Extra random delay (0..jitterMs).
   * @param {boolean} [options.enabled=true]
   */
  constructor(options = {}) {
    const o = options === false ? { enabled: false } : (options === true || !options ? {} : options);
    this.enabled = o.enabled !== false;
    this.minGapMs = o.minGapMs !== undefined ? o.minGapMs : 450;
    this.perThreadGapMs = o.perThreadGapMs !== undefined ? o.perThreadGapMs : 700;
    this.jitterMs = o.jitterMs !== undefined ? o.jitterMs : 150;

    this._chain = Promise.resolve();
    this._lastGlobal = 0;
    this._lastByThread = new Map();
  }

  /**
   * Waits for this send's turn. Calls are served strictly in order (FIFO).
   * @param {string} [threadId]
   */
  wait(threadId = null) {
    if (!this.enabled) return Promise.resolve();

    const turn = this._chain.then(async () => {
      const now = Date.now();
      const key = threadId ? String(threadId) : null;
      const lastThread = key ? (this._lastByThread.get(key) || 0) : 0;

      const readyAt = Math.max(
        this._lastGlobal + this.minGapMs,
        lastThread + this.perThreadGapMs
      );
      const jitter = this.jitterMs > 0 ? Math.random() * this.jitterMs : 0;
      const delay = Math.max(0, readyAt - now) + (readyAt > now ? jitter : 0);
      if (delay > 0) await sleep(delay);

      const stamp = Date.now();
      this._lastGlobal = stamp;
      if (key) {
        this._lastByThread.set(key, stamp);
        if (this._lastByThread.size > 500) {
          this._lastByThread.delete(this._lastByThread.keys().next().value);
        }
      }
    });

    // Keep the chain alive even if a waiter is abandoned.
    this._chain = turn.catch(() => {});
    return turn;
  }
}

/**
 * Pulls a thread id out of a direct_v2 URL when present.
 */
function threadIdFromUrl(url) {
  const m = /direct_v2\/threads\/(\d+)/.exec(String(url || ''));
  return m ? m[1] : null;
}

/** Whether a POST URL is an outgoing "write" that should be throttled. */
function isThrottledUrl(url) {
  const u = String(url || '');
  return /direct_v2\/threads\/broadcast\/(?!reaction|indicate_activity|mark_seen)/.test(u) || /rupload_ig(photo|video|voice)/.test(u);
}

module.exports = { SendThrottle, threadIdFromUrl, isThrottledUrl, sleep };
