'use strict';

/**
 * Mobile-app style realtime sync state, the way Tanvir143's tanvir-mqtt does it.
 *
 * Reads the Android identity from the Session JSON (session.json: uuids, mid, userAgent,
 * authorizationData, cookieStore ...) and calls the PRIVATE mobile API
 * (https://i.instagram.com/api/v1/direct_v2/inbox/?fetch_reason=initial_snapshot) to get the real
 * seq_id + snapshot_at_ms. The mobile API is not hit by the web "pending account prompt" that
 * blocks the web/REST inbox, and Instagram only pushes message_sync over MQTT when the Iris
 * subscription carries these real values.
 */

const axios = require('axios');

const APP_ID = '567067343352427';

function cookieValue(session, name) {
  const list = (session && session.cookieStore && session.cookieStore.cookies) || [];
  const hit = list.find((c) => c && (c.key === name || c.name === name) && c.value);
  return hit ? String(hit.value) : '';
}

function buildHeaders(session) {
  const uuids = session.uuids || {};
  const auth = session.authorizationData || {};
  const sessionid = auth.sessionid || cookieValue(session, 'sessionid');
  const userId = String(auth.ds_user_id || cookieValue(session, 'ds_user_id') || '');
  const locale = String(session.locale || 'en_US').replace('-', '_');
  const mid = session.mid || cookieValue(session, 'mid');
  const csrf = session.csrftoken || cookieValue(session, 'csrftoken');

  const cookies = [];
  const add = (k, v) => { if (v) cookies.push(`${k}=${v}`); };
  add('sessionid', sessionid);
  add('ds_user_id', userId);
  add('csrftoken', csrf);
  add('mid', mid);
  add('ig_did', cookieValue(session, 'ig_did'));
  add('rur', cookieValue(session, 'rur'));

  const headers = {
    'X-IG-App-Locale': locale,
    'X-IG-Device-Locale': locale,
    'X-IG-Mapped-Locale': locale,
    'X-IG-App-Startup-Country': String(session.country || 'US').toUpperCase(),
    'X-Bloks-Version-Id': (session.deviceSettings && session.deviceSettings.bloks_versioning_id) || '',
    'X-IG-WWW-Claim': session.igWwwClaim || '0',
    'X-Bloks-Is-Layout-RTL': 'false',
    'X-IG-Device-ID': uuids.uuid || '',
    'X-IG-Family-Device-ID': uuids.phone_id || '',
    'X-IG-Android-ID': uuids.android_device_id || '',
    'X-IG-Timezone-Offset': String(session.timezoneOffset || 0),
    'X-IG-Connection-Type': 'WIFI',
    'X-IG-Capabilities': '3brTv10=',
    'X-IG-App-ID': APP_ID,
    'User-Agent': session.userAgent || '',
    'Accept-Language': 'en-US',
    'Accept-Encoding': 'gzip, deflate',
    'IG-INTENDED-USER-ID': userId || '0',
    Authorization: 'Bearer IGT:2:' + Buffer.from(JSON.stringify({ ds_user_id: userId, sessionid })).toString('base64'),
    Cookie: cookies.join('; ')
  };
  if (mid) headers['X-MID'] = mid;
  if (userId) headers['IG-U-DS-USER-ID'] = userId;
  if (session.igURur) headers['IG-U-RUR'] = session.igURur;
  for (const k of Object.keys(headers)) if (headers[k] === '') delete headers[k];
  return { headers, sessionid, userId };
}

/**
 * @param {Object} session parsed session.json
 * @returns {Promise<{seqId:number, snapshotAtMs:number}|null>}
 */
async function fetchSyncState(session, timeoutMs = 15000) {
  if (!session || typeof session !== 'object') return null;
  const { headers, sessionid } = buildHeaders(session);
  if (!sessionid || !headers['User-Agent']) return null;
  const res = await axios.get('https://i.instagram.com/api/v1/direct_v2/inbox/', {
    headers,
    timeout: timeoutMs,
    params: {
      visual_message_return_type: 'unseen',
      thread_message_limit: '1',
      persistentBadging: 'true',
      limit: '1',
      is_prefetching: 'false',
      fetch_reason: 'initial_snapshot'
    }
  });
  const data = (res && res.data) || {};
  if (data.seq_id === undefined || data.snapshot_at_ms === undefined) return null;
  const seqId = Number(data.seq_id);
  const snapshotAtMs = Number(data.snapshot_at_ms);
  if (!Number.isFinite(seqId) || !Number.isFinite(snapshotAtMs)) return null;
  return { seqId, snapshotAtMs };
}

module.exports = { fetchSyncState, buildHeaders };
