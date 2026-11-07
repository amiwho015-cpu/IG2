/*
 * Author: Tanvir Ahmed (tanvir143)
 * File Name: ica.js
 */

"use strict";

const localICA = require("./tanvir-mqtt");

function callbackify(promise, callback, transform) {
  const p = Promise.resolve(promise).then(value => transform ? transform(value) : value);
  if (typeof callback === "function") {
    p.then(value => callback(null, value), error => callback(error));
    return undefined;
  }
  return p;
}

function installCompat(api) {
  const messageThreads = new Map();
  api._userID = String(api.userId || "");
  api.getCurrentUserID = () => String(api.userId || api._userID || "");

  // Preserve ICA's original getUserInfo while exposing callback-compatible lookup.
  const nativeGetUserInfo = api.getUserInfo.bind(api);
  api.getUserInfoByIdCompat = nativeGetUserInfo;
  api.getUserInfo = (id, cb) => callbackify(nativeGetUserInfo(String(id)), cb,
    user => ({ [String(id)]: Object.assign({}, user, { userID: String(user.userId || user.pk || id), name: user.fullName || user.username, vanity: user.username }) }));

  api.getUserID = (username, cb) => callbackify(api.getUserIdFromUsername(String(username).replace(/^@/, "")), cb, id => id == null ? null : String(id));
  api.getUserByUsername = (username) => api.getUserInfoByUsername(String(username).replace(/^@/, ""));
  api.findUserByUsername = api.getUserByUsername;
  api.searchUser = api.getUserByUsername;
  api.resolveProfile = async (id) => {
    const info = await nativeGetUserInfo(String(id));
    return { userID: String(info.userId || info.pk || id), username: info.username, name: info.fullName || info.username, profilePicUrl: info.profilePicUrl };
  };

  api.getThreadInfo = (threadId, cb) => callbackify(api.getThread(String(threadId), { amount: 1 }), cb, thread => ({
    threadID: String(thread.id || thread.thread_id || threadId),
    threadName: thread.thread_title || thread.threadName || "",
    isGroup: Boolean(thread.is_group || thread.isGroup || (thread.users && thread.users.length > 2)),
    participantIDs: (thread.users || thread.participants || []).map(u => String(u.pk || u.user_id || u.id || u)),
    userInfo: (thread.users || thread.participants || []).map(u => ({ userID: String(u.pk || u.user_id || u.id || ""), name: u.full_name || u.username, vanity: u.username })),
    adminIDs: (thread.admin_user_ids || thread.adminIDs || []).map(String),
    messageCount: thread.messages ? thread.messages.length : 0,
    raw: thread
  }));

  api.getThreadList = (limit, timestamp, source, cb) => {
    const callback = typeof limit === "function" ? limit : cb;
    const amount = typeof limit === "number" ? limit : 20;
    return callbackify(api.getThreads({ amount }), callback, threads => threads.map(t => ({
      threadID: String(t.id || t.thread_id || ""),
      name: t.thread_title || t.threadName || "",
      isGroup: Boolean(t.is_group || t.isGroup),
      participantIDs: (t.users || t.participants || []).map(u => String(u.pk || u.user_id || u.id || u)),
      messageCount: (t.messages || []).length,
      raw: t
    })));
  };

  const nativeSendMessage = api.sendMessage.bind(api);
  api.sendMessage = (form, threadID, cb, replyTo) => {
    const payload = typeof form === "string" ? { text: form } : { text: String((form && (form.body || form.text)) || "") };
    payload.threadIds = [String(threadID)];
    if (replyTo) payload.replyTo = { id: String(replyTo.messageID || replyTo.id || replyTo), client_context: replyTo.client_context };
    return callbackify(nativeSendMessage(payload), cb);
  };

  api.sendImage = (source, threadID, caption, cb, replyTo) => callbackify(
    api.sendPhoto({ source, threadIds: [String(threadID)], caption }), cb);
  const nativeSendVideo = api.sendVideo.bind(api);
  api.sendVideoNativeCompat = nativeSendVideo;
  api.sendVideo = (source, threadID, cb) => callbackify(nativeSendVideo({ source, threadIds: [String(threadID)] }), cb);
  api.sendAudio = (source, threadID, cb, replyTo) => callbackify(api.sendVoice({ source, threadIds: [String(threadID)] }), cb);

  api.unsendMessage = (messageID, cb) => {
    // ICA requires thread id; locate the message in recent threads where possible.
    const run = async () => {
      let threadId = messageThreads.get(String(messageID));
      if (!threadId) {
        const threads = await api.getThreads({ amount: 30 });
        for (const thread of threads) {
          if ((thread.messages || []).some(m => String(m.id || m.item_id) === String(messageID))) {
            threadId = String(thread.id || thread.thread_id);
            break;
          }
        }
      }
      if (!threadId) throw new Error("Cannot unsend: message thread was not found.");
      return api.deleteMessage(String(threadId), String(messageID));
    };
    return callbackify(run(), cb);
  };

  api.setMessageReaction = (reaction, messageID, cb) => {
    const run = async () => {
      let threadId = messageThreads.get(String(messageID));
      if (!threadId) {
        const threads = await api.getThreads({ amount: 30 });
        for (const thread of threads) {
          if ((thread.messages || []).some(m => String(m.id || m.item_id) === String(messageID))) {
            threadId = String(thread.id || thread.thread_id);
            break;
          }
        }
      }
      if (!threadId) throw new Error("Cannot react: message thread was not found.");
      return api.setMessageReaction({ threadId: String(threadId), messageId: String(messageID), emoji: String(reaction) });
    };
    return callbackify(run(), cb);
  };

  api.addUserToThread = (userId, threadID, cb) => callbackify(api.addUsersToThread(String(threadID), [String(userId)]), cb);
  api.removeUserFromThread = (userId, threadID, cb) => callbackify(api.removeMember(String(threadID), [String(userId)]), cb);
  api.sendTypingIndicator = (threadID) => { api.sendTyping(String(threadID)); return () => {}; };
  api.sendTextEffect = (text, threadID, effect, cb) => callbackify(api.sendMessage({ text, threadIds: [String(threadID)] }), cb);
  api.sendAvatarTextEffect = (text, threadID, effect, cb) => callbackify(api.sendMessage({ text, threadIds: [String(threadID)] }), cb);
  // Tanvir's bundled ICA exposes catalogue search, but this version does not
  // implement a native Direct music-share broadcast. Never fake it as plain text.
  api.sendMusic = (threadID, track, cb) => callbackify(
    Promise.reject(new Error("Native Instagram Music DM sharing is not implemented by this ICA package version.")), cb);
  api.musicSearch = (query, cb) => callbackify(api.searchMusic(String(query)), cb, result => {
    const items = Array.isArray(result) ? result
      : Array.isArray(result && result.items) ? result.items
      : Array.isArray(result && result.tracks) ? result.tracks
      : Array.isArray(result && result.results) ? result.results
      : Array.isArray(result && result.data) ? result.data
      : [];
    return { tracks: items.map(item => item && (item.track || item.original_sound || item))
      .filter(Boolean).map(track => ({
        ...track,
        audioClusterID: track.audioClusterID || track.audio_cluster_id || track.audioClusterId,
        audioAssetID: track.audioAssetID || track.audio_asset_id,
        title: track.title || track.canonical_title || track.name || "Unknown",
        artist: track.artist || track.display_artist || track.original_artist || "Unknown"
      })) };
  });

  const nativeChangeProfilePicture = api.changeProfilePicture.bind(api);
  api.changeProfilePicture = (source, cb) => {
    const run = async () => {
      const media = require("./tanvir-mqtt/src/message/sending/media");
      const loaded = await media.loadSource({ url: source });
      try {
        media.validateImage(loaded.bytes, loaded.ext);
        const upload = media.createUploadClient();
        const uploadId = await media.ruploadPhoto(api, loaded.bytes, upload);
        return nativeChangeProfilePicture({ uploadId: String(uploadId) });
      } finally {
        if (loaded.cleanup) await loaded.cleanup();
      }
    };
    return callbackify(run(), cb);
  };

  const nativeListen = api.listen.bind(api);
  api.listenMqtt = (callback) => {
    const stop = nativeListen(event => {
      if (event && event.messageID && event.threadID) messageThreads.set(String(event.messageID), String(event.threadID));
      callback(null, event);
    });
    return typeof stop === "function" ? stop : () => api.realtimeDisconnect();
  };
  return api;
}

function login(options, botOptions, callback) {
  // Bot passes a complete Instagram Session JSON object in options.session.
  const opts = Object.assign({}, botOptions || {}, options || {}, { autoUpdate: false });
  localICA.login(opts).then(api => callbackify(Promise.resolve(installCompat(api)), callback), error => callback(error));
}

module.exports = Object.freeze({ login, packageName: "./tanvir-mqtt" });
