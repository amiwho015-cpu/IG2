/*
 * Author: Tanvir Ahmed (tanvir143)
 * File Name: tray.js
 */

'use strict';

const { normalizeStory } = require('./reads');

async function getStoryTray(client, options) {
  const opts = options || {};
  const res = await client.api.request({ endpoint: 'feed/reels_tray/', method: 'GET', params: {} });
  const trays = (res || {}).tray || (res || {}).reels_media || [];
  const out = [];
  trays.forEach((tray) => {
    const user = tray.user || {};
    const items = (tray.items || []).map((item) => normalizeStory(item, user.pk));
    if (opts.amount) {
      items.splice(opts.amount);
    }
    out.push({
      userId: user.pk ? String(user.pk) : null,
      username: user.username || null,
      stories: items,
    });
  });
  return out;
}

module.exports = {
  getStoryTray,
};