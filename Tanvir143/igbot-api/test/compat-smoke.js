/**
 * File Name: compat-smoke.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";
const assert = require("assert");
const login = require("../index");
assert.strictEqual(typeof login, "function");
assert.strictEqual(login.login, login);
assert.strictEqual(login.connect, login);
assert.strictEqual(typeof login.utils.checkLiveCookie, "function");
const { ClientApi } = require("../lib/api");
const fakeTransport = {
  sessionId: "test-session",
  config: { serverUrl: "http://127.0.0.1", apiKey: "test", timeoutMs: 50 },
  call: async (name, args) => ({ name, args }),
  close() {}
};
const api = new ClientApi(fakeTransport, { userID: "123", username: "tester", methods: [] }, { userID: "123", options: {} });
assert.strictEqual(api.getCurrentUserID(), "123");
assert.strictEqual(api.getCurrentUser().userID, "123");
assert.strictEqual(typeof api.listen, "function");
assert.strictEqual(typeof api.listenMqtt, "function");
for (const name of [
  "getInbox", "getUserInfoByUsername", "replyToMessage", "sendReaction", "stopTypingIndicator",
  "sendPhoto", "sendVideo", "sendVoice", "sendGIF", "getHealth", "sendImage", "sendAudio",
  "sendMusic", "musicSearch", "sendTextEffect", "sendAvatarTextEffect", "addUserToThread",
  "removeUserFromThread", "sendTypingIndicator"
]) assert.strictEqual(typeof api[name], "function", name);
assert.strictEqual(api._userID, "123");

// Verify command-framework aliases preserve the expected positional arguments.
const calls = [];
api.sendMessage = (...args) => { calls.push(["sendMessage", ...args]); return Promise.resolve({ ok: true }); };
api.sendMusicSticker = (...args) => { calls.push(["sendMusicSticker", ...args]); return Promise.resolve({ ok: true }); };
api.searchMusic = (...args) => { calls.push(["searchMusic", ...args]); return Promise.resolve({ ok: true }); };
api.addUserToGroup = (...args) => { calls.push(["addUserToGroup", ...args]); return Promise.resolve({ ok: true }); };
api.removeUserFromGroup = (...args) => { calls.push(["removeUserFromGroup", ...args]); return Promise.resolve({ ok: true }); };
api.sendImage("image.jpg", "thread-1", "", () => {}, "reply-1");
api.sendAudio("audio.mp3", "thread-1", () => {}, "reply-2");
api.sendTextEffect("hello", "thread-1", "love", () => {});
api.sendAvatarTextEffect("hello", "thread-1", "laugh", () => {});
api.sendMusic("thread-1", { audioAssetId: "track-1" }, () => {});
api.musicSearch("track", () => {});
api.addUserToThread("user-1", "thread-1", () => {});
api.removeUserFromThread("user-1", "thread-1", () => {});
assert.strictEqual(calls[0][1].attachment, "image.jpg");
assert.strictEqual(calls[0][2], "thread-1");
assert.strictEqual(calls[0][4], "reply-1");
assert.strictEqual(calls[1][1].mediaType, "audio");
assert.strictEqual(calls[2][1].effect, "love");
assert.strictEqual(calls[3][1].avatarEffect, "laugh");
assert.strictEqual(calls[4][0], "sendMusicSticker");
assert.strictEqual(calls[5][0], "searchMusic");
assert.strictEqual(calls[6][0], "addUserToGroup");
assert.strictEqual(calls[7][0], "removeUserFromGroup");
console.log("igbot-api compatibility smoke test passed");
