"use strict";

/**
 * igAdapter tests — the fca-style api on top of a fake InstaChatClient.
 *   node --test test/adapter.test.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const EventEmitter = require("events");
const path = require("path");
const os = require("os");

const root = path.resolve(__dirname, "..");
require(path.join(root, "src/logger")).setQuiet(true);
const { login, cookiesToMap } = require(path.join(root, "src/igAdapter"));
const { Events } = require(path.join(root, "lib/instachat-api/src"));

class FakeClient extends EventEmitter {
	constructor(options) {
		super();
		this.options = options;
		this.userId = "100";
		this.username = "botuser";
		this.calls = [];
		this.realtime = { isRunning: true, consecutiveErrors: 0, currentDelayMs: 2500, start() { this.isRunning = true; } };
		this.session = { cookies: { sessionid: "abc" }, load: () => { } };
		const rec = name => async (...args) => { this.calls.push({ name, args }); return this._ret[name] !== undefined ? this._ret[name] : { id: "sent" + this.calls.length }; };
		this._ret = {};
		for (const n of ["sendMessage", "reply", "sendReaction", "deleteReaction", "unsendMessage", "editMessage", "sendTypingIndicator",
			"addParticipants", "removeParticipant", "setThreadTitle", "markSeen"]) this[n] = rec(n);
	}
	async connect() { this.isReady = true; }
	async disconnect() { this.disconnected = true; }
	async checkSession() { return true; }
	async getUserById(id) { return { id, username: "user" + id, fullName: "User " + id, profilePicUrl: "http://pic" }; }
	async getUserByUsername(name) { return { id: "555", username: name, fullName: "Named " + name }; }
	async getConversation(id) {
		return { id, isGroup: true, title: "Group", participants: [{ id: "1", username: "a" }, { id: "2", username: "b" }], adminUserIds: ["1"], nicknames: {}, messages: [] };
	}
}

const cookies = [{ key: "sessionid", value: "abc" }, { key: "ds_user_id", value: "100" }, { key: "csrftoken", value: "t" }];
const make = (config = {}) => login({ cookies, config: Object.assign({ database: { dir: path.join(os.tmpdir(), "igadapter-test-" + process.pid) } }, config), ClientClass: FakeClient });
const msg = (over = {}) => Object.assign({ id: "m1", threadId: "t1", senderId: "5", text: "hi", isSelf: false, mentions: [], timestamp: 1, type: "text" }, over);
const wait = ms => new Promise(r => setTimeout(r, ms));

test("cookiesToMap handles lists and maps", () => {
	assert.deepEqual(cookiesToMap(cookies), { sessionid: "abc", ds_user_id: "100", csrftoken: "t" });
	assert.deepEqual(cookiesToMap({ a: "1" }), { a: "1" });
});

test("login passes cookies and throttle/poll settings to the client", async () => {
	const api = await make({ instachat: { pollIntervalMs: 3000, throttle: { minGapMs: 900 } } });
	assert.equal(api.client.options.cookies.sessionid, "abc");
	assert.equal(api.client.options.pollIntervalMs, 3000);
	assert.equal(api.client.options.throttle.minGapMs, 900);
	assert.equal(api.getCurrentUserID(), "100");
	await assert.rejects(() => login({ cookies: [{ key: "x", value: "y" }], config: {}, ClientClass: FakeClient }), /sessionid/);
});

test("sendMessage: text, callback style, reply and attachments", async () => {
	const api = await make();
	const r1 = await api.sendMessage("hello", "t1");
	assert.equal(r1.threadID, "t1");
	assert.ok(r1.messageID);
	assert.deepEqual(api.client.calls[0], { name: "sendMessage", args: ["t1", "hello"] });

	const viaCb = await new Promise((resolve, reject) => api.sendMessage({ body: "yo" }, "t1", (e, r) => (e ? reject(e) : resolve(r))));
	assert.ok(viaCb.messageID);

	await api.sendMessage({ body: "re" }, "t1", () => { }, "orig9");
	const reply = api.client.calls.find(c => c.name === "reply");
	assert.deepEqual([reply.args[0], reply.args[1], reply.args[2].body], ["t1", "orig9", "re"]);

	const stream = { pipe() { }, on() { } };
	await api.sendMessage({ body: "", attachment: stream }, "t1");
	const last = api.client.calls[api.client.calls.length - 1];
	assert.deepEqual(last.args[1].attachments, [stream]);
	assert.equal(last.args[1].body, undefined);
});

test("reaction/unsend/edit find the thread from messages the bot has seen", async () => {
	const api = await make();
	await assert.rejects(() => api.setMessageReaction("🔥", "unknown"), /Unknown thread/);

	api.listenMqtt(() => { });
	api.client.emit(Events.MESSAGE, msg({ id: "m7", threadId: "tX" }));
	await api.setMessageReaction("🔥", "m7", () => { }, true);
	await api.setMessageReaction("", "m7");
	await api.editMessage("new", "m7");
	await api.unsendMessage("m7");
	await api.unsendMessage("tX:m7");
	const names = api.client.calls.map(c => `${c.name}:${c.args[0]}:${c.args[1]}`);
	assert.deepEqual(names, ["sendReaction:tX:m7", "deleteReaction:tX:m7", "editMessage:tX:m7", "unsendMessage:tX:m7", "unsendMessage:tX:m7"]);
});

test("listenMqtt maps messages, replies, mentions and attachments", async () => {
	const api = await make();
	const events = [];
	const stop = api.listenMqtt((e, ev) => events.push([e, ev]));
	api.client.emit(Events.MESSAGE, msg({
		text: "look @bob", mentions: [{ userId: "9", username: "bob" }],
		media: { type: "image", url: "http://x/y.jpg", width: 10, height: 20 },
		replyTo: { id: "m0", senderId: "100", text: "orig" }
	}));
	await wait(5);
	const ev = events[0][1];
	assert.equal(ev.type, "message");
	assert.equal(ev.threadID, "t1");
	assert.equal(ev.senderID, "5");
	assert.deepEqual(ev.mentions, { 9: "@bob" });
	assert.equal(ev.attachments[0].type, "image");
	assert.equal(ev.repliedToMessage.messageID, "m0");

	stop();
	api.client.emit(Events.MESSAGE, msg({ id: "m2" }));
	await wait(5);
	assert.equal(events.length, 1, "a stopped listener must receive nothing");
});

test("the bot's own sends are not delivered back as events; owner messages from another device are", async () => {
	const api = await make({ selfListen: true });
	const events = [];
	api.listenMqtt((e, ev) => events.push(ev));
	const sent = await api.sendMessage("pong", "t1");

	api.client.emit(Events.MESSAGE, msg({ id: sent.messageID, senderId: "100", isSelf: true, text: "pong" }));
	api.client.emit(Events.MESSAGE, msg({ id: "typedByOwner", senderId: "100", isSelf: true, text: "?help" }));
	await wait(1700);
	assert.deepEqual(events.map(e => e.messageID), ["typedByOwner"]);

	const quiet = await make({ selfListen: false });
	const got = [];
	quiet.listenMqtt((e, ev) => got.push(ev));
	quiet.client.emit(Events.MESSAGE, msg({ id: "own", senderId: "100", isSelf: true }));
	await wait(1700);
	assert.equal(got.length, 0);
});

test("reactions, unsends and membership changes become fca events", async () => {
	const api = await make();
	const events = [];
	api.listenMqtt((e, ev) => events.push(ev));

	api.client.emit(Events.REACTION, { threadId: "t1", messageId: "m1", senderId: "5", emoji: "😡", isSelf: false });
	api.client.emit(Events.REACTION, { threadId: "t1", messageId: "m1", senderId: "100", emoji: "👍", isSelf: true });
	api.client.emit(Events.MESSAGE_UNSENT, { threadId: "t1", messageId: "m9", senderId: "5" });
	api.client.emit(Events.PARTICIPANTS_CHANGED, { threadId: "g1", added: [{ id: "7", username: "newbie" }], removed: [{ id: "8", username: "gone" }] });

	assert.deepEqual(events.map(e => e.type), ["message_reaction", "message_unsend", "join", "leave"]);
	assert.equal(events[0].reaction, "😡");
	assert.equal(events[0].senderID, "5");
	assert.deepEqual(events[2].userIDs, ["7"]);
	assert.deepEqual(events[2].usernames, ["@newbie"]);
	assert.equal(events[2].isGroup, true);
	assert.deepEqual(events[3].userIDs, ["8"]);
});

test("auth errors reach the listener as a login_required error", async () => {
	const api = await make();
	const errors = [];
	api.listenMqtt(e => e && errors.push(e));
	api.client.emit(Events.AUTH_ERROR, new Error("expired"));
	assert.match(errors[0].message, /login_required/);
});

test("getThreadInfo / getUserInfo / getThreadList return the shapes commands read", async () => {
	const api = await make();
	const info = await api.getThreadInfo("g1");
	assert.equal(info.isGroup, true);
	assert.equal(info.threadName, "Group");
	assert.deepEqual(info.adminIDs, [{ id: "1" }]);
	assert.ok(info.participantIDs.includes("1") && info.participantIDs.includes("100"));

	const users = await api.getUserInfo(["42"]);
	assert.equal(users["42"].name, "User 42");
	assert.equal(users["42"].vanity, "user42");
	const byName = await new Promise((res, rej) => api.getUserInfo("@zed", (e, r) => (e ? rej(e) : res(r))));
	assert.equal(byName["555"].vanity, "zed");

	api.client.getConversations = async () => [{ id: "g1", isGroup: true, title: "G", participants: [{ id: "1" }, { id: "2" }, { id: "3" }] }];
	const list = await api.getThreadList(10, null, ["INBOX"]);
	assert.equal(list[0].threadID, "g1");
	assert.equal(list[0].isGroup, true);
});

test("group management maps to the client", async () => {
	const api = await make();
	await api.addUserToGroup("7", "g1");
	await api.removeUserFromGroup(["8", "9"], "g1");
	await api.setTitle("New name", "g1");
	const calls = api.client.calls.map(c => c.name);
	assert.deepEqual(calls, ["addParticipants", "removeParticipant", "setThreadTitle"]);
	assert.deepEqual(api.client.calls[1].args, ["g1", ["8", "9"]]);
});

test("unsupported features fail clearly (promise and callback)", async () => {
	const api = await make();
	await assert.rejects(() => api.changeBio("x"), /not supported/);
	const err = await new Promise(res => api.changeProfilePicture("p", e => res(e)));
	assert.equal(err.code, "UNSUPPORTED_FEATURE");
});

test("logout only disconnects; reloadSession re-reads cookies", async () => {
	let reloaded = 0;
	const api = await login({ cookies, config: {}, ClientClass: FakeClient, reloadCookies: () => { reloaded++; return cookies; } });
	assert.equal(await api.reloadSession(), true);
	assert.equal(reloaded, 1);
	await api.logout();
	assert.equal(api.client.disconnected, true);
});

test("sendTypingIndicator returns a stop function", async () => {
	const api = await make();
	const stop = api.sendTypingIndicator("t1", () => { });
	assert.equal(typeof stop, "function");
	stop();
	await wait(5);
	assert.deepEqual(api.client.calls.map(c => c.args[1]), [true, false]);
});

test("a 429 on a profile lookup pauses lookups and later calls fail fast (or use the cache)", async () => {
	const api = await make();
	let hits = 0;
	api.client.getUserByUsername = async () => { hits++; throw Object.assign(new Error("Rate limit reached"), { status: 429, retryAfter: 5 }); };
	await assert.rejects(() => api.getUserInfo("someone"), /rate/i);
	const t0 = Date.now();
	await assert.rejects(() => api.getUserInfo("other"), /rate limit|paused/i);
	assert.ok(Date.now() - t0 < 200, "paused lookup must fail immediately");
	assert.equal(hits, 1, "no second request while paused");
});

test("profile lookups are cached and de-duplicated; thread info is cached", async () => {
	const api = await make();
	let n = 0, convs = 0;
	api.client.getUserByUsername = async name => { n++; await wait(20); return { id: "9", username: name, fullName: "N" }; };
	api.client.getConversation = async id => { convs++; return { id, isGroup: true, title: "G", participants: [{ id: "1" }], adminUserIds: [], nicknames: {}, messages: [] }; };
	await Promise.all([api.getUserInfo("bob"), api.getUserInfo("bob"), api.getUserInfo("@bob")]);
	await api.getUserInfo("bob");
	assert.equal(n, 1);
	await Promise.all([api.getThreadInfo("t1"), api.getThreadInfo("t1")]);
	await api.getThreadInfo("t1");
	assert.equal(convs, 1);
});

test("reactions and typing bypass the send throttle queue; messages do not", () => {
	const { isThrottledUrl } = require(path.join(root, "lib/instachat-api/src/utils/throttle"));
	const base = "https://i.instagram.com/api/v1/direct_v2/threads/broadcast/";
	assert.equal(isThrottledUrl(base + "text/"), true);
	assert.equal(isThrottledUrl(base + "reaction/"), false);
	assert.equal(isThrottledUrl(base + "indicate_activity/"), false);
});

test("a reply always carries WHO it replies to (payload, seen-message cache, or thread history)", async () => {
	const api = await make();
	const got = [];
	api.listenMqtt((e, ev) => { if (!e && ev.type === "message") got.push(ev); });
	const { Events } = require(path.join(root, "lib/instachat-api/src"));

	// 1. quoted message was seen earlier, payload has no sender id
	api.client.emit(Events.MESSAGE, msg({ id: "orig1", senderId: "77", text: "Kno mar khabi?" }));
	api.client.emit(Events.MESSAGE, msg({ id: "r1", senderId: "5", text: "-kill", replyTo: { id: "orig1", senderId: "", text: "" } }));
	// 2. quoted message never seen: found in the thread history
	api.client.getConversation = async id => ({ id, isGroup: true, title: "G", participants: [], adminUserIds: [], nicknames: {},
		messages: [{ id: "old9", senderId: "88", text: "old text" }] });
	api.client.emit(Events.MESSAGE, msg({ id: "r2", senderId: "5", text: "-kill", replyTo: { id: "old9", senderId: "", text: "" } }));
	// 3. quoted message is one the bot sent
	await api.sendMessage("hello", "t1");
	const sentId = api.client.calls.find(c => c.name === "sendMessage") && "sent1";
	api.client.emit(Events.MESSAGE, msg({ id: "r3", senderId: "5", text: "x", replyTo: { id: sentId, senderId: "", text: "" } }));
	await wait(120);

	const by = id => got.find(e => e.messageID === id);
	assert.equal(by("r1").repliedToMessage.senderID, "77");
	assert.equal(by("r1").repliedToMessage.body, "Kno mar khabi?");
	assert.equal(by("r2").repliedToMessage.senderID, "88");
	assert.equal(by("r3").repliedToMessage.senderID, "100");
});

test("the bot's own profile and group members are answered without hitting Instagram", async () => {
	const api = await make();
	let hits = 0;
	api.client.getUserById = async id => { hits++; throw Object.assign(new Error("Rate limit reached"), { status: 429 }); };
	const me = await api.getUserInfo("100");
	assert.equal(me["100"].vanity, "botuser");
	assert.equal(hits, 0, "self lookup must not use the network");
	await api.getThreadInfo("t9");                 // learns members "1" (a) and "2" (b)
	const other = await api.getUserInfo("1");      // throttled -> falls back to the member list
	assert.equal(other["1"].vanity, "a");
});
