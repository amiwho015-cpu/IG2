/*
 * Author: Tanvir Ahmed (tanvir143)
 * File Name: viewers.js
 */

'use strict';

async function getStoryViewers(client, options) {
  const opts = typeof options === 'object' && options !== null ? options : { storyPk: options };
  const storyPk = String(opts.storyPk || '').split('_')[0];
  if (!storyPk) {
    throw new Error('tanvir-mqtt: getStoryViewers needs { storyPk }');
  }
  const viewers = [];
  const seen = new Set();
  let maxId = opts.maxId || '';
  for (;;) {
    const params = {};
    if (maxId) {
      params.max_id = maxId;
    }
    const res = await client.api.request({
      endpoint: 'media/' + storyPk + '/list_reel_media_viewer/',
      method: 'GET',
      params,
    });
    ((res || {}).viewers || []).forEach((item) => {
      const user = item.user || {};
      const pk = user.pk ? String(user.pk) : null;
      if (!pk || seen.has(pk)) {
        return;
      }
      seen.add(pk);
      viewers.push({ userId: pk, username: user.username || null, liked: Boolean(item.has_liked) });
      if (opts.amount && viewers.length >= opts.amount) {
        return;
      }
    });
    if (opts.amount && viewers.length >= opts.amount) {
      break;
    }
    maxId = (res && res.next_max_id) || '';
    if (!maxId) {
      break;
    }
  }
  return opts.amount ? viewers.slice(0, opts.amount) : viewers;
}

module.exports = {
  getStoryViewers,
};