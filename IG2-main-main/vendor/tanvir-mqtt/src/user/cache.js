/*
 * Author: Tanvir Ahmed (tanvir143)
 * File Name: cache.js
 */

'use strict';

function createIdentityCache(options) {
  const opts = options || {};
  const max = opts.max || 100;
  const ttlMs = opts.ttlMs || 3600000;
  const store = new Map();
  return {
    get(userId) {
      const key = String(userId);
      const entry = store.get(key);
      if (!entry) {
        return null;
      }
      if (Date.now() - entry.at > ttlMs) {
        store.delete(key);
        return null;
      }
      return entry.username;
    },
    set(userId, username) {
      const key = String(userId);
      if (store.has(key)) {
        store.delete(key);
      }
      store.set(key, { username: String(username), at: Date.now() });
      while (store.size > max) {
        const oldest = store.keys().next().value;
        store.delete(oldest);
      }
    },
    stats() {
      return { size: store.size, max, ttlMs };
    },
  };
}

module.exports = { createIdentityCache };