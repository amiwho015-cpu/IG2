/*
 * Author: Tanvir Ahmed (tanvir143)
 * File Name: ica.js
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const localICA = require("./tanvir-mqtt");

const MEDIA_TMP = path.join(os.tmpdir(), "instabot-ica-media");

/*
 * tanvir-mqtt's sendPhoto / sendVideo / sendVoice only accept { path } or { url }.
 * The bot layer hands over whatever it has: a Buffer (gcimg, converted audio),
 * a stream, a local path or a URL string. Normalise all of them to { path } / { url }
 * so the vendored loader never throws "media send needs { path } or { url }".
 */
function rand() { return Math.random().toString(36).slice(2, 12); }

function sniffExt(buf, kind) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return ".jpg";
  if (buf.length >= 4 && buf[0] === 0x89 && buf.slice(1, 4).toString("ascii") === "PNG") return ".png";
  if (buf.length >= 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return ".webp";
  if (buf.length >= 12 && buf.slice(4, 8).toString("ascii") === "ftyp") return kind === "audio" ? ".m4a" : ".mp4";
  return kind === "audio" ? ".m4a" : kind === "video" ? ".mp4" : ".jpg";
}

function drainStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function toLoadable(source, kind) {
  if (Array.isArray(source)) source = source[0];
  if (source == null) throw new Error("no media source given");

  // { url | path | buffer | stream, filename, ... } wrappers
  if (typeof source === "object" && !Buffer.isBuffer(source) && typeof source.pipe !== "function") {
    if (source.url) return { value: { url: String(source.url) }, cleanup: null };
    if (source.path) return { value: { path: String(source.path) }, cleanup: null };
    const inner = source.buffer || source.stream;
    if (inner == null) throw new Error("media object has no buffer/stream/path/url");
    source = inner;
  }

  if (typeof source === "string") {
    if (/^https?:\/\//i.test(source)) return { value: { url: source }, cleanup: null };
    if (fs.existsSync(source)) return { value: { path: source }, cleanup: null };
    throw new Error(`media not found: ${source.slice(0, 80)}`);
  }

  let buffer;
  if (Buffer.isBuffer(source)) {
    buffer = source;
  }
  else if (typeof source.pipe === "function") {
    if (source.path && fs.existsSync(String(source.path))) return { value: { path: String(source.path) }, cleanup: null };
    buffer = await drainStream(source);
  }
  else {
    throw new Error("unsupported media source type");
  }
  if (!buffer.length) throw new Error("media source is empty");

  fs.mkdirSync(MEDIA_TMP, { recursive: true });
  const file = path.join(MEDIA_TMP, `${rand()}${sniffExt(buffer, kind)}`);
  fs.writeFileSync(file, buffer);
  return { value: { path: file }, cleanup: () => fs.unlink(file, () => { }) };
}

async function withLoadable(source, kind, run) {
  const { value, cleanup } = await toLoadable(source, kind);
  try { return await run(value); }
  finally { if (cleanup) cleanup(); }
}

/* Some callers pass the callback where the caption goes: shift the arguments. */
function shiftCaption(caption, cb, replyTo) {
  if (typeof caption === "function") return { caption: "", cb: caption, replyTo: cb };
  return { caption: caption == null ? "" : caption, cb, replyTo };
}

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
    // Remember which thread each sent message went to, so unsend/react can find it later.
    const remember = r => {
      const id = r && (r.id || r.messageID || r.messageId || r.item_id);
      if (id) messageThreads.set(String(id), String(threadID));
      return r;
    };
    return callbackify(Promise.resolve(nativeSendMessage(payload)).then(remember), cb);
  };

  api.sendImage = (source, threadID, caption, cb, replyTo) => {
    ({ caption, cb } = shiftCaption(caption, cb, replyTo));
    return callbackify(withLoadable(source, "image", value =>
      api.sendPhoto({ source: value, threadIds: [String(threadID)], caption })), cb);
  };
  const nativeSendVideo = api.sendVideo.bind(api);
  api.sendVideoNativeCompat = nativeSendVideo;
  api.sendVideo = (source, threadID, caption, cb, replyTo) => {
    ({ cb } = shiftCaption(caption, cb, replyTo));
    return callbackify(withLoadable(source, "video", value =>
      nativeSendVideo({ source: value, threadIds: [String(threadID)] })), cb);
  };
  api.sendAudio = (source, threadID, cb, replyTo) => callbackify(
    withLoadable(source, "audio", value => api.sendVoice({ source: value, threadIds: [String(threadID)] })), cb);

  // Callers use (id), (id, cb), (id, threadID) or (id, threadID, cb).
  api.unsendMessage = (messageID, ...rest) => {
    const cb = rest.find(a => typeof a === "function");
    const explicitThread = rest.find(a => typeof a === "string" || typeof a === "number");
    // ICA requires thread id; locate the message in recent threads where possible.
    const run = async () => {
      let threadId = explicitThread != null ? String(explicitThread) : messageThreads.get(String(messageID));
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

  // Keep the vendored method: the wrapper below replaces api.setMessageReaction,
  // and calling api.setMessageReaction from inside it would call itself.
  const nativeSetMessageReaction = typeof api.setMessageReaction === "function" ? api.setMessageReaction.bind(api) : null;
  // Callers use (emoji, id), (emoji, id, cb), (emoji, id, threadID) or (emoji, id, threadID, cb).
  api.setMessageReaction = (reaction, messageID, ...rest) => {
    const cb = rest.find(a => typeof a === "function");
    const explicitThread = rest.find(a => typeof a === "string" || typeof a === "number");
    const run = async () => {
      let threadId = explicitThread != null ? String(explicitThread) : messageThreads.get(String(messageID));
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
      if (!nativeSetMessageReaction) throw new Error("setMessageReaction is not available in this ICA build");
      return nativeSetMessageReaction({ threadId: String(threadId), messageId: String(messageID), emoji: String(reaction) });
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

  // Reply bridge. The vendored listener only says WHICH message was replied to
  // (event.replyTo.itemId) and never carries its media. The bot's commands read
  // event.repliedToMessage / event.messageReply.attachments, so fill those in here:
  // from a cache of recently seen items first, then from the thread history.
  const { extractAttachments } = require("./tanvir-mqtt/src/message/normalize");
  const itemCache = new Map(); // itemID -> { attachments, text, senderID }
  const rememberItem = event => {
    if (!event || !event.messageID) return;
    const attachments = Array.isArray(event.attachments) ? event.attachments : [];
    if (!attachments.length && !event.body) return;
    itemCache.set(String(event.messageID), { attachments, text: event.body || "", senderID: event.senderID || "" });
    if (itemCache.size > 3000) itemCache.delete(itemCache.keys().next().value);
  };
  const findItem = async (itemID, threadID) => {
    const cached = itemCache.get(String(itemID));
    if (cached && cached.attachments.length) return cached;
    if (!threadID) return cached || null;
    try {
      const thread = await api.getThread(String(threadID), { amount: 40 });
      const items = (thread && thread.messages) || [];
      const item = items.find(m => String(m.id || m.item_id) === String(itemID));
      if (!item) return cached || null;
      const found = {
        attachments: extractAttachments(item),
        text: typeof item.text === "string" ? item.text : (cached && cached.text) || "",
        senderID: item.user_id != null ? String(item.user_id) : (cached && cached.senderID) || "",
      };
      itemCache.set(String(itemID), found);
      return found;
    }
    catch (_) { return cached || null; }
  };

  const nativeListen = api.listen.bind(api);
  api.listenMqtt = (callback) => {
    const stop = nativeListen(event => {
      if (event && event.messageID && event.threadID) messageThreads.set(String(event.messageID), String(event.threadID));
      rememberItem(event);
      const ref = event && event.replyTo;
      const emit = () => { try { callback(null, event); } catch (e) { console.error("[listen] callback threw:", e && e.message || e); } };
      if (!ref || !ref.itemId || event.repliedToMessage) return emit();
      const replyID = String(ref.itemId);
      findItem(replyID, event.threadID).then(found => {
        event.repliedToMessage = {
          messageID: replyID,
          senderID: ref.authorUserId || (found && found.senderID) || null,
          body: (found && found.text) || ref.text || "",
          attachments: (found && found.attachments) || [],
          timestamp: null,
        };
      }, () => { /* keep the event without media */ }).then(emit);
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

module.exports = Object.freeze({ login, packageName: "./tanvir-mqtt", _toLoadable: toLoadable });
