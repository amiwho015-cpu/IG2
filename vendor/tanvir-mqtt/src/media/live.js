/*
 * Author: Tanvir Ahmed (tanvir143)
 * File Name: live.js
 */

'use strict';

async function createLivestream(client, title) {
  const res = await client.api.request({
    endpoint: 'live/create/',
    data: {
      _uuid: client.uuid,
      _uid: String(client.userId),
      preview_height: 1920,
      preview_width: 1080,
      broadcast_message: title || 'Instagram Live',
      broadcast_type: 'RTMP',
      internal_only: 0,
      _csrftoken: client.csrftoken,
    },
  });
  const broadcastId = res && res.broadcast_id;
  if (!broadcastId) {
    throw new Error('tanvir-mqtt: livestream create returned no broadcast_id');
  }
  const parts = String(res.upload_url || '').split(String(broadcastId));
  return {
    broadcastId: String(broadcastId),
    streamServer: parts.length >= 2 ? parts[0] : null,
    streamKey: parts.length >= 2 ? String(broadcastId) + parts[1] : null,
    raw: res,
  };
}

async function startLivestream(client, broadcastId) {
  if (!broadcastId) {
    throw new Error('tanvir-mqtt: startLivestream needs { broadcastId }');
  }
  const res = await client.api.request({
    endpoint: 'live/' + broadcastId + '/start/',
    data: {
      _uuid: client.uuid,
      _uid: String(client.userId),
      should_send_notifications: 1,
      _csrftoken: client.csrftoken,
    },
  }).catch(() => null);
  return Boolean(res && res.status === 'ok');
}

async function endLivestream(client, broadcastId) {
  if (!broadcastId) {
    throw new Error('tanvir-mqtt: endLivestream needs { broadcastId }');
  }
  const res = await client.api.request({
    endpoint: 'live/' + broadcastId + '/end_broadcast/',
    data: {
      _uuid: client.uuid,
      _uid: String(client.userId),
      _csrftoken: client.csrftoken,
    },
  }).catch(() => null);
  return Boolean(res && res.status === 'ok');
}

async function getLivestreamInfo(client, broadcastId) {
  if (!broadcastId) {
    throw new Error('tanvir-mqtt: getLivestreamInfo needs { broadcastId }');
  }
  const res = await client.api.request({ endpoint: 'live/' + broadcastId + '/info/', method: 'GET' });
  return res;
}

async function getLivestreamComments(client, broadcastId) {
  if (!broadcastId) {
    throw new Error('tanvir-mqtt: getLivestreamComments needs { broadcastId }');
  }
  const res = await client.api.request({ endpoint: 'live/' + broadcastId + '/get_comment/', method: 'GET' });
  return ((res || {}).comments || []).map((c) => ({ username: c.user && c.user.username, text: c.text }));
}

async function getLivestreamViewers(client, broadcastId) {
  if (!broadcastId) {
    throw new Error('tanvir-mqtt: getLivestreamViewers needs { broadcastId }');
  }
  const res = await client.api.request({ endpoint: 'live/' + broadcastId + '/get_viewer_list/', method: 'GET' });
  return ((res || {}).users || []).map((u) => ({ username: u.username, userId: u.pk ? String(u.pk) : null }));
}

module.exports = {
  createLivestream,
  startLivestream,
  endLivestream,
  getLivestreamInfo,
  getLivestreamComments,
  getLivestreamViewers,
};