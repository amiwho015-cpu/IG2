/*
 * Author: Tanvir Ahmed (tanvir143)
 * File Name: track.js
 */

'use strict';

function normalizeTrack(raw) {
  const data = (raw && raw.track) || raw || {};
  return {
    audioAssetId: data.audio_asset_id || data.id || null,
    audioClusterId: data.audio_cluster_id || null,
    title: data.title || null,
    artist: data.display_artist || null,
    highlightStart: null,
    musicCanonicalId: data.music_canonical_id || null,
    alacornSessionId: data.alacorn_session_id || null,
    raw: data,
  };
}

async function searchMusic(client, query, browseSessionId) {
  if (!query) {
    throw new Error('tanvir-mqtt: searchMusic needs { query }');
  }
  const res = await client.api.request({
    endpoint: 'music/audio_global_search/',
    method: 'GET',
    params: { query: String(query), browse_session_id: browseSessionId || require('../core/utils').uuid4() },
  });
  return ((res || {}).items || []).filter((item) => item.track).map(normalizeTrack);
}

async function musicInFeedBrowser(client, browseSessionId) {
  const res = await client.api.request({
    endpoint: 'music/music_in_feed_audio_browser/',
    data: {
      product: 'music_in_feed',
      _uuid: client.uuid,
      browse_session_id: browseSessionId || require('../core/utils').uuid4(),
    },
    withSignature: false,
  });
  return res;
}

async function musicTrending(client, product) {
  const res = await client.api.request({
    endpoint: 'music/trending/',
    data: { product: product || 'feed_post', _uuid: client.uuid },
    withSignature: false,
  });
  return res;
}

function sessionId(client, given) {
  return given || require('../core/utils').uuid4();
}

async function searchMusicV2(client, query, options) {
  const opts = options || {};
  if (!query) {
    throw new Error('tanvir-mqtt: searchMusicV2 needs { query }');
  }
  return client.api.request({
    endpoint: 'music/search_v2/',
    method: 'POST',
    data: {
      from_typeahead: opts.fromTypeahead ? 'true' : 'false',
      search_session_id: sessionId(client, opts.searchSessionId),
      product: opts.product || 'music_in_feed',
      q: String(query),
      _uuid: client.uuid,
      browse_session_id: sessionId(client, opts.browseSessionId),
    },
  });
}

async function musicKeywordSearch(client, query, options) {
  const opts = options || {};
  if (!query) {
    throw new Error('tanvir-mqtt: musicKeywordSearch needs { query }');
  }
  return client.api.request({
    endpoint: 'music/keyword_search/',
    method: 'GET',
    params: {
      num_keywords: String(opts.numKeywords || 3),
      search_session_id: opts.searchSessionId || '',
      product: opts.product || 'music_in_feed',
      q: String(query),
      browse_session_id: sessionId(client, opts.browseSessionId),
    },
  });
}

async function bookmarkTrack(client, audioId, surface) {
  if (!audioId) {
    throw new Error('tanvir-mqtt: bookmarkTrack needs { audioId }');
  }
  const res = await client.api.request({
    endpoint: 'music/bookmark_music/',
    method: 'POST',
    data: {
      original_audio_id: String(audioId),
      _uuid: client.uuid,
      surface_requested_from: surface || 'audio_aggregation_page',
    },
  });
  return Boolean((res || {}).success) || ((res || {}).status || '') === 'ok';
}

async function bookmarkedTracks(client, maxId) {
  const data = { _uuid: client.uuid };
  if (maxId) {
    data.max_id = maxId;
  }
  return client.api.request({
    endpoint: 'music/playlist/bookmarked/',
    method: 'POST',
    data,
  });
}

async function clipsAudioBrowser(client, options) {
  const opts = options || {};
  return client.api.request({
    endpoint: 'music/clips_audio_browser/',
    method: 'POST',
    data: {
      product: opts.product || 'story_camera_clips_v2',
      _uuid: client.uuid,
      browse_session_id: sessionId(client, opts.browseSessionId),
    },
  });
}

async function verifyAudioTitle(client, title) {
  if (!title) {
    throw new Error('tanvir-mqtt: verifyAudioTitle needs { title }');
  }
  const res = await client.api.request({
    endpoint: 'music/verify_original_audio_title/',
    method: 'POST',
    data: { original_audio_name: String(title), _uuid: client.uuid },
  });
  return Boolean((res || {}).is_valid);
}

async function trackInfoByCanonicalId(client, canonicalId) {
  const res = await client.api.request({
    endpoint: 'clips/music/',
    method: 'POST',
    data: { tab_type: 'clips', referrer_media_id: '', _uuid: client.uuid, music_canonical_id: String(canonicalId) },
  });
  const track = ((((res || {}).metadata || {}).music_info || {}).music_asset_info) || null;
  if (!track) {
    throw new Error('tanvir-mqtt: track not found: ' + canonicalId);
  }
  return normalizeTrack(track);
}

async function trackInfoById(client, trackId, maxId) {
  const data = { audio_cluster_id: String(trackId), original_sound_audio_asset_id: String(trackId) };
  if (maxId) {
    data.max_id = maxId;
  }
  return client.api.request({
    endpoint: 'clips/music/',
    method: 'POST',
    data,
  });
}

async function trackStreamInfoById(client, trackId, maxId) {
  const musicPage = { tab_type: 'clips', audio_asset_id: String(trackId), audio_cluster_id: String(trackId) };
  if (maxId) {
    musicPage.max_id = maxId;
  }
  return client.api.request({
    endpoint: 'clips/stream_clips_pivot_page/',
    method: 'POST',
    data: {
      pivot_page_type: 'audio',
      music_page: musicPage,
      _uuid: client.uuid,
    },
  });
}

module.exports = {
  normalizeTrack,
  searchMusic,
  musicInFeedBrowser,
  musicTrending,
  searchMusicV2,
  musicKeywordSearch,
  bookmarkTrack,
  bookmarkedTracks,
  clipsAudioBrowser,
  verifyAudioTitle,
  trackInfoByCanonicalId,
  trackInfoById,
  trackStreamInfoById,
};