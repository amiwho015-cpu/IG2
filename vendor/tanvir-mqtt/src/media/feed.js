/*
 * Author: Tanvir Ahmed (tanvir143)
 * File Name: feed.js
 */

'use strict';

const { normalizeMediaInfo } = require('./info');

const REELS_ENDPOINTS = {
  reels: 'clips/connected/',
  explore: 'clips/discover/',
  friends: 'clips/discover/social/',
};

async function getTimelineFeed(client, options) {
  const opts = options || {};
  const out = [];
  let maxId = opts.maxId || '';
  const seen = new Set([maxId]);
  for (;;) {
    const params = {};
    if (maxId) {
      params.max_id = maxId;
    }
    const res = await client.api.request({ endpoint: 'feed/timeline/', method: 'GET', params });
    ((res || {}).items || []).forEach((raw) => {
      out.push(normalizeMediaInfo(raw.media || raw));
    });
    if (opts.amount && out.length >= opts.amount) {
      break;
    }
    maxId = (res && res.next_max_id) || '';
    if (!maxId || seen.has(maxId)) {
      break;
    }
    seen.add(maxId);
  }
  return opts.amount ? out.slice(0, opts.amount) : out;
}

async function reelsTimeline(client, collection, options) {
  const opts = options || {};
  const endpoint = REELS_ENDPOINTS[collection];
  if (!endpoint) {
    throw new Error('tanvir-mqtt: unknown reels collection: ' + collection);
  }
  const out = [];
  let maxId = '';
  const seen = new Set(['']);
  for (;;) {
    if (opts.amount && out.length >= opts.amount) {
      break;
    }
    const res = await client.api.request({ endpoint, data: ' ', params: { max_id: maxId } });
    const items = (res || {}).items || (res || {}).items_with_ads || [];
    for (const item of items) {
      const media = item.media;
      if (!media) {
        continue;
      }
      if (opts.lastMediaPk && String(opts.lastMediaPk) === String(media.pk)) {
        return out;
      }
      out.push(normalizeMediaInfo(media));
      if (opts.amount && out.length >= opts.amount) {
        return out.slice(0, opts.amount);
      }
    }
    const paging = (res || {}).paging_info || {};
    if (!paging.more_available) {
      break;
    }
    maxId = paging.max_id || '';
    if (!maxId || seen.has(maxId)) {
      break;
    }
    seen.add(maxId);
  }
  return out;
}

async function getReels(client, options) {
  return reelsTimeline(client, 'reels', options);
}

async function getExploreReels(client, options) {
  return reelsTimeline(client, 'explore', options);
}

async function getFriendsReels(client, options) {
  return reelsTimeline(client, 'friends', options);
}

module.exports = {
  getTimelineFeed,
  getReels,
  getExploreReels,
  getFriendsReels,
};