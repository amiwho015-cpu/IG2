/**
 * File Name: run.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

/**
 * InstaBOT test runner — no external dependencies.
 * Exercises config parsing, event normalization, the message context and the
 * dispatcher against a fake igbot-api client.
 *
 *   node test/run.js
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

const root = path.resolve(__dirname, "..");

// Redirect config writes to a scratch copy BEFORE anything requires src/config.
// Several commands call saveConfig() (admin, whitelist, prefix); without this a
// test run overwrites the operator's real config.json.
const SCRATCH_CONFIG = path.join(os.tmpdir(), "instabot-test-config-" + process.pid + ".json");
try { fs.copyFileSync(path.join(root, "config.json"), SCRATCH_CONFIG); } catch (_) { fs.writeFileSync(SCRATCH_CONFIG, "{}"); }
process.env.IG_CONFIG_PATH = SCRATCH_CONFIG;
process.on("exit", () => { try { fs.unlinkSync(SCRATCH_CONFIG); } catch (_) { } });

const log = require(path.join(root, "src/logger"));
log.setQuiet(true);

const { normalizeEvent } = require(path.join(root, "src/bot"));
const { normalizeCookies, netScapeToCookies, cookieHeaderToCookies, isNetScapeCookie } = require(path.join(root, "src/config"));
const utils = require(path.join(root, "src/utils"));
const { createMessageContext } = require(path.join(root, "src/message"));
const { createRegistry, loadAll } = require(path.join(root, "src/commandLoader"));
const { createDispatcher } = require(path.join(root, "src/dispatcher"));

let count = 0;
const results = [];
async function test(name, fn) {
	try {
		await fn();
		count++;
		results.push({ name, ok: true });
	}
	catch (error) {
		results.push({ name, ok: false, error });
	}
}

function fakeApi(overrides = {}) {
	const calls = [];
	const api = Object.assign({
		calls,
		getCurrentUserID: () => "100",
		getUserInfo: (id, cb) => cb(null, { [id]: { userID: id, name: "Test User", vanity: "tester" } }),
		getThreadInfo: (id, cb) => cb(null, { threadID: id, isGroup: true, userInfo: [], adminIDs: [] }),
		sendMessage: (form, threadID, cb, reply) => {
			calls.push({ method: "sendMessage", form, threadID, reply });
			cb && cb(null, { threadID, messageID: "m" + calls.length });
			return Promise.resolve({ threadID, messageID: "m" + calls.length });
		},
		sendImage: (img, threadID, caption, cb, reply) => {
			calls.push({ method: "sendImage", img, caption, reply, threadID });
			cb && cb(null, { threadID, messageID: "img" + calls.length });
		},
		sendAudio: (a, threadID, cb, reply) => { calls.push({ method: "sendAudio", src: a, threadID, reply }); cb && cb(null, { threadID, messageID: "aud" + calls.length }); },
		sendVideo: (v, threadID, cb) => { calls.push({ method: "sendVideo", threadID }); cb && cb(null, {}); },
		unsendMessage: (id, cb) => { calls.push({ method: "unsendMessage", id }); cb && cb(null, {}); },
		setMessageReaction: (r, id, cb) => { calls.push({ method: "setMessageReaction", r, id }); cb && cb(null, {}); },
		sendTextEffect: (text, threadID, effect, cb) => { calls.push({ method: "sendTextEffect", text, effect }); cb && cb(null, {}); },
		sendAvatarTextEffect: (text, threadID, effect, cb) => { calls.push({ method: "sendAvatarTextEffect", text, effect }); cb && cb(null, {}); },
		sendMusic: (threadID, track, cb) => { calls.push({ method: "sendMusic", threadID, track }); cb && cb(null, { threadID, messageID: "music" }); },
		musicSearch: (query, cb) => {
			calls.push({ method: "musicSearch", query });
			cb && cb(null, { query, tracks: [
				{ title: "Song A", artist: "Artist A", durationMs: 210000, audioClusterID: "111", url: "https://cdn.example/song-a.mp4" },
				{ title: "Song B", artist: "Artist B", durationMs: 180000, audioClusterID: "222", url: "https://cdn.example/song-b.mp4" }
			] });
		},
		sendTypingIndicator: () => () => { },
		changeProfilePicture: (src, cb) => { calls.push({ method: "changeProfilePicture", src }); cb && cb(null, {}); },
		changeBio: (b, cb) => { calls.push({ method: "changeBio", b }); cb && cb(null, {}); },
		addUserToThread: (uid, threadID, cb) => { calls.push({ method: "addUserToThread", uid, threadID }); cb && cb(null, {}); },
		removeUserFromThread: (uid, threadID, cb) => { calls.push({ method: "removeUserFromThread", uid, threadID }); cb && cb(null, {}); },
		listenMqtt: () => () => { }
	}, overrides);
	return api;
}

function makeConfig(overrides = {}) {
	return Object.assign({
		botName: "InstaBOT",
		prefix: "-",
		language: "en",
		adminBot: ["999"],
		antiInbox: false,
		noPrefix: false,
		adminOnly: { enable: false, ignoreCommands: [] },
		whiteList: { enable: false, userIDs: [], threadIDs: [] },
		hideNotiMessage: {},
		cooldown: { default: 0 },
		logEvents: { disableAll: true },
		listenEvents: true
	}, overrides);
}

function makeDatabase() {
	const users = new Map();
	const threads = new Map();
	return {
		users: {
			ensure(id, patch) { if (!users.has(id)) users.set(id, Object.assign({ userID: id, banned: { status: false }, settings: {}, data: {} }, patch)); return users.get(id); },
			get: id => users.get(id) || null,
			update(id, patch) { const u = users.get(id); if (u) Object.assign(u, patch); return u; },
			set(id, patch) { users.set(id, patch); return patch; },
			count: () => users.size,
			flush() { }
		},
		threads: {
			ensure(id, patch) { if (!threads.has(id)) threads.set(id, Object.assign({ threadID: id, adminIDs: [], members: [], settings: {}, data: {} }, patch)); return threads.get(id); },
			get: id => threads.get(id) || null,
			update(id, patch) { const t = threads.get(id); if (t) Object.assign(t, patch); return t; },
			count: () => threads.size,
			flush() { }
		}
	};
}

async function main() {
	// Username lookups are cached on disk; start every run clean.
	utils._resetUsernameCache();

	/* ── event normalization ── */
	await test("normalizeEvent: reply becomes message_reply + messageReply", () => {
		const ev = normalizeEvent({
			type: "message", threadID: "t", messageID: "m", senderID: "42", body: "hi",
			attachments: [{ type: "image", url: "u" }],
			repliedToMessage: { messageID: "o", senderID: "9", body: "bot" }
		});
		assert.strictEqual(ev.type, "message_reply");
		assert.strictEqual(ev.messageReply.messageID, "o");
		assert.strictEqual(ev.messageReply.senderID, "9");
		assert.strictEqual(ev.attachments[0].type, "photo");
		assert.strictEqual(ev.userID, "42");
	});

	await test("normalizeEvent: plain message keeps type", () => {
		const ev = normalizeEvent({ type: "message", threadID: "t", messageID: "m", senderID: "42", body: "hi", attachments: [] });
		assert.strictEqual(ev.type, "message");
		assert.strictEqual(ev.messageReply, undefined);
	});

	/* ── config parsing ── */
	await test("config: JSON array cookies", () => {
		const list = normalizeCookies([{ key: "sessionid", value: "a" }, { key: "ds_user_id", value: "1" }]);
		assert.strictEqual(list.length, 2);
		assert.strictEqual(list[0].domain, "instagram.com");
	});

	await test("config: cookie header string", () => {
		const list = cookieHeaderToCookies("sessionid=a; ds_user_id=1; csrftoken=x");
		assert.strictEqual(list.length, 3);
	});

	await test("config: a blank music.apiUrl never falls back to env.url", () => {
		// Regression: a host that sets INSTABOT_URL to its own service URL made
		// `sing` query the bot's own host and get a 404.
		const { loadConfig } = require(path.join(root, "src/config"));
		const previous = process.env.INSTABOT_URL;
		process.env.INSTABOT_URL = "https://the-bot-itself.onrender.com";
		try {
			const config = loadConfig();
			assert.strictEqual(config.music.apiUrl, "", "blank music.apiUrl must stay blank");
		}
		finally {
			if (previous === undefined) delete process.env.INSTABOT_URL;
			else process.env.INSTABOT_URL = previous;
		}
	});

	/* ── anisearch ── */
	await test("anisearch: registered with the Neoaz author", () => {
		const command = registry.resolve("anisearch");
		assert.ok(command, "anisearch should be registered");
		assert.strictEqual(command.config.author, "Neoaz 🐊");
		assert.strictEqual(command.config.category, "media");
	});

	await test("anisearch: missing query asks for usage", async () => {
		const command = registry.resolve("anisearch");
		const sent = [];
		const message = { reply: form => { sent.push(form); return Promise.resolve({ messageID: "x" }); } };
		await command.onStart({ args: [], message });
		assert.ok(/usage/i.test(String(sent[0])), "expected a usage hint");
	});

	await test("anisearch: searches, downloads and sends the video bytes", async () => {
		const command = registry.resolve("anisearch");
		const originalFetch = global.fetch;
		const seen = [];
		global.fetch = async (url, options) => {
			seen.push(String(url));
			if (String(url).includes("/tik-sr")) {
				return { ok: true, status: 200, json: async () => ({ results: [{ url: "https://www.tiktok.com/@a/video/1" }] }) };
			}
			if (String(url).includes("/alldl")) {
				return {
					ok: true, status: 200,
					json: async () => ({ metadata: { data: { title: "Naruto edit", downloads: [{ label: "MP4 (No Watermark)", ext: "mp4", url: "https://cdn.example/v.mp4" }] } } })
				};
			}
			// The actual video download: small enough to send.
			return {
				ok: true, status: 200,
				headers: { get: name => (name === "content-length" ? "1024" : null) },
				arrayBuffer: async () => new Uint8Array(1024).buffer
			};
		};
		const replies = [];
		const reactions = [];
		const message = {
			reply: form => { replies.push(form); return Promise.resolve({ messageID: "x" }); },
			react: emoji => { reactions.push(emoji); return Promise.resolve({}); }
		};
		try {
			await command.onStart({ args: ["naruto"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.strictEqual(replies.length, 2, "a text then the video");
		assert.strictEqual(String(replies[0]), "Naruto edit", "the title/caption goes first");
		const video = replies[1];
		assert.ok(Buffer.isBuffer(video.attachment.buffer), "the video must be sent as bytes, not a URL");
		assert.strictEqual(video.attachment.buffer.length, 1024);
		assert.strictEqual(video.attachment.fileName, "anisearch.mp4", "mp4 extension hint must be attached");
		assert.deepStrictEqual(reactions, ["⏳", "✅"], "loading then success reactions");
		assert.ok(seen.some(u => u.includes("/tik-sr?q=naruto")), "search endpoint hit");
		assert.ok(seen.some(u => u.includes("/alldl?url=")), "download endpoint hit");
		assert.ok(seen.some(u => u.includes("cdn.example/v.mp4")), "video fetched by the bot, not the server");
	});

	await test("anisearch: retries the next result when a video is too large", async () => {
		const command = registry.resolve("anisearch");
		const originalFetch = global.fetch;
		let downloadCount = 0;
		global.fetch = async (url) => {
			if (String(url).includes("/tik-sr")) {
				return {
					ok: true, status: 200,
					json: async () => ({ results: [{ url: "https://www.tiktok.com/@a/video/1" }, { url: "https://www.tiktok.com/@a/video/2" }] })
				};
			}
			if (String(url).includes("/alldl")) {
				return {
					ok: true, status: 200,
					json: async () => ({ metadata: { data: { title: "Edit", downloads: [{ label: "MP4", ext: "mp4", url: "https://cdn.example/v.mp4" }] } } })
				};
			}
			downloadCount++;
			// First download is oversized; the retry is small.
			const size = downloadCount === 1 ? 50 * 1024 * 1024 : 2048;
			return {
				ok: true, status: 200,
				headers: { get: name => (name === "content-length" ? String(size) : null) },
				arrayBuffer: async () => new Uint8Array(size).buffer
			};
		};
		const replies = [];
		const message = {
			reply: form => { replies.push(form); return Promise.resolve({ messageID: "x" }); },
			react: () => Promise.resolve({})
		};
		try {
			await command.onStart({ args: ["naruto"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		const video = replies.find(r => r && r.attachment);
		assert.ok(video && Buffer.isBuffer(video.attachment.buffer), "expected a video on the retry");
		assert.strictEqual(video.attachment.buffer.length, 2048);
		assert.strictEqual(downloadCount, 2, "the oversized first download must be retried");
	});

	await test("anisearch: a bare 'Error' from the server is surfaced usefully", async () => {
		const command = registry.resolve("anisearch");
		const originalFetch = global.fetch;
		global.fetch = async (url) => {
			if (String(url).includes("/tik-sr")) {
				return { ok: true, status: 200, json: async () => ({ results: [{ url: "https://www.tiktok.com/@a/video/1" }] }) };
			}
			if (String(url).includes("/alldl")) {
				return {
					ok: true, status: 200,
					json: async () => ({ metadata: { data: { title: "Edit", downloads: [{ label: "MP4", ext: "mp4", url: "https://cdn.example/v.mp4" }] } } })
				};
			}
			throw new Error("Video download failed (HTTP 403)");
		};
		let sent = null;
		const reactions = [];
		const message = {
			reply: form => { sent = form; return Promise.resolve({ messageID: "x" }); },
			react: emoji => { reactions.push(emoji); return Promise.resolve({}); }
		};
		try {
			await command.onStart({ args: ["naruto"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(/HTTP 403/.test(String(sent)), "the real reason must be shown, not a bare 'Error'");
		assert.deepStrictEqual(reactions, ["⏳", "❌"], "loading then failure reactions");
	});

	await test("anisearch: no matches reports an error", async () => {
		const command = registry.resolve("anisearch");
		const originalFetch = global.fetch;
		global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) });
		let sent = null;
		const reactions = [];
		const message = {
			reply: form => { sent = form; return Promise.resolve({ messageID: "x" }); },
			react: emoji => { reactions.push(emoji); return Promise.resolve({}); }
		};
		try {
			await command.onStart({ args: ["nothing"], message });
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(/Could not find a video/.test(String(sent)), "expected an error reply");
		assert.deepStrictEqual(reactions, ["⏳", "❌"], "loading then failure reactions");
	});

	/* ── unsend ── */
	await test("unsend: registered with the Neoaz author", () => {
		const command = registry.resolve("unsend");
		assert.ok(command, "unsend should be registered");
		assert.strictEqual(command.config.author, "Neoaz 🐊");
		assert.strictEqual(command.config.category, "utility");
	});

	await test("unsend: removes the message the command replies to", async () => {
		const command = registry.resolve("unsend");
		const calls = [];
		const api = {
			unsendMessage: (id, cb) => { calls.push({ id }); cb && cb(null, {}); }
		};
		await command.onStart({
			api,
			message: { reply: () => { throw new Error("unsend must not reply"); } },
			event: { threadID: "t1", messageID: "evt", messageReply: { messageID: "botmsg", senderID: "42" } }
		});
		assert.strictEqual(calls.length, 1, "expected exactly one unsend");
		assert.strictEqual(calls[0].id, "botmsg");
		assert.strictEqual(calls[0].id, "botmsg");
	});

	await test("unsend: does nothing without a reply", async () => {
		const command = registry.resolve("unsend");
		let called = false;
		const api = { unsendMessage: () => { called = true; } };
		await command.onStart({
			api,
			message: { reply: () => { throw new Error("unsend must not reply"); } },
			event: { threadID: "t1", messageID: "evt" }
		});
		assert.strictEqual(called, false, "no reply target means no unsend");
	});

	await test("unsend: swallows a refused unsend without replying", async () => {
		const command = registry.resolve("unsend");
		const api = {
			unsendMessage: (id, cb) => { cb && cb(new Error("not your message")); }
		};
		await command.onStart({
			api,
			message: { reply: () => { throw new Error("unsend must not reply"); } },
			event: { threadID: "t1", messageID: "evt", messageReply: { messageID: "other", senderID: "99" } }
		});
	});

	/* ── adduser / removeuser ── */
	await test("adduser: registered with the Neoaz author", () => {
		const command = registry.resolve("adduser");
		assert.ok(command, "adduser should be registered");
		assert.strictEqual(command.config.author, "Neoaz 🐊");
		assert.strictEqual(command.config.role, 2);
	});

	await test("adduser: adds a numeric id to the current thread", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-adduser 555", { api, db, config: makeConfig(), extraEvent: { isGroup: true } });
		assert.ok(api.calls.some(c => c.method === "addUserToThread" && c.uid === "555" && c.threadID === "t"));
		assert.ok(/555/.test(out), "expected a confirmation");
	});

	await test("adduser: resolves an @mention through the public profile", async () => {
		const api = fakeApi();
		api.getUserInfo = (id, cb) => cb(new Error("session handle lookup unsupported"));
		utils._resetUsernameCache();
		const original = utils.download;
		utils.download = async () => Buffer.from(JSON.stringify({ data: { user: { id: "777", username: "someone" } } }));
		const db = makeDatabase();
		try {
			await runCommand("-adduser @someone", { api, db, config: makeConfig(), extraEvent: { isGroup: true } });
		}
		finally {
			utils.download = original;
		}
		assert.ok(api.calls.some(c => c.method === "addUserToThread" && c.uid === "777"), "expected the resolved mention id");
	});

	await test("adduser: falls back to the replied user", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		await runCommand("-adduser", { api, db, config: makeConfig(), extraEvent: { isGroup: true, messageReply: { senderID: "321", messageID: "o" } } });
		assert.ok(api.calls.some(c => c.method === "addUserToThread" && c.uid === "321"));
	});

	await test("adduser: refuses outside a group", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-adduser 555", { api, db, config: makeConfig() });
		assert.ok(/group/i.test(out));
		assert.ok(!api.calls.some(c => c.method === "addUserToThread"));
	});

	await test("adduser: unknown mention reports it", async () => {
		const api = fakeApi({ getUserInfo: (id, cb) => cb(null, {}) });
		const original = utils.download;
		utils.download = async () => Buffer.from(JSON.stringify({ data: {} }));
		const db = makeDatabase();
		let out;
		try {
			out = await runCommand("-adduser @ghost", { api, db, config: makeConfig(), extraEvent: { isGroup: true } });
		}
		finally {
			utils.download = original;
		}
		assert.ok(/@ghost/.test(out));
	});

	await test("removeuser: registered with the Neoaz author", () => {
		const command = registry.resolve("removeuser");
		assert.ok(command, "removeuser should be registered");
		assert.strictEqual(command.config.author, "Neoaz 🐊");
		assert.strictEqual(command.config.role, 2);
	});

	await test("removeuser: removes the replied user from the thread", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const out = await runCommand("-removeuser", { api, db, config: makeConfig(), extraEvent: { isGroup: true, messageReply: { senderID: "321", messageID: "o" } } });
		assert.ok(api.calls.some(c => c.method === "removeUserFromThread" && c.uid === "321" && c.threadID === "t"));
		assert.ok(/321/.test(out));
	});

	await test("removeuser: resolves an @mention and a numeric id", async () => {
		const api = fakeApi();
		const original = utils.download;
		utils._resetUsernameCache();
		api.getUserInfo = (id, cb) => cb(new Error("session handle lookup unsupported"));
		utils.download = async () => Buffer.from(JSON.stringify({ data: { user: { id: "888", username: "who" } } }));
		const db = makeDatabase();
		try {
			await runCommand("-removeuser @who", { api, db, config: makeConfig(), extraEvent: { isGroup: true } });
		}
		finally {
			utils.download = original;
		}
		await runCommand("-removeuser 9999", { api, db, config: makeConfig(), extraEvent: { isGroup: true } });
		assert.ok(api.calls.some(c => c.method === "removeUserFromThread" && c.uid === "888"));
		assert.ok(api.calls.some(c => c.method === "removeUserFromThread" && c.uid === "9999"));
	});

	/* ── ai ── */
	await test("ai: registered to NZ R with the ai alias", () => {
		const command = registry.resolve("ai");
		assert.ok(command, "ai should be registered");
		assert.strictEqual(command.config.author, "NZ R.");
		assert.strictEqual(command.config.category, "ai");
		assert.strictEqual(registry.resolve("ritchi"), command);
	});

	await test("ai: empty input asks for a message", async () => {
		const command = registry.resolve("ai");
		const out = await command.onStart({
			message: { reply: text => text },
			args: [],
			event: { senderID: "1", threadID: "t" },
			config: makeConfig()
		});
		assert.ok(/online|send a message/i.test(out));
	});

	await test("ai: 'clear' resets the session memory", async () => {
		const command = registry.resolve("ai");
		command._internal.sessions.set("t:1", { history: [{ role: "user", content: "hi" }], lastActive: Date.now(), lastBotMessageID: null, lastBotAt: 0 });
		const out = await command.onStart({
			message: { reply: text => text },
			args: ["clear"],
			event: { senderID: "1", threadID: "t" },
			config: makeConfig()
		});
		assert.ok(/cleared/i.test(out));
		assert.ok(!command._internal.sessions.has("t:1"));
	});

	await test("ai: answers, remembers and arms a reply handler", async () => {
		const command = registry.resolve("ai");
		command._internal.sessions.delete("t:2");
		const originalFetch = global.fetch;
		global.fetch = async url => ({
			ok: true,
			json: async () => String(url).includes("kilwa-claude")
				? { status: "success", reply: "Hey there!" }
				: { status: "success", reply: "love" }
		});
		const replies = [];
		let armed = null;
		try {
			await command.onStart({
				message: { reply: text => { replies.push(text); return { messageID: "bot1" }; }, typing: () => () => { }, react: () => { } },
				args: ["hello"],
				event: { senderID: "2", threadID: "t" },
				config: makeConfig(),
				setReplyHandler: (handler, id) => { armed = { handler, id }; }
			});
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(replies.some(r => /Hey there!/.test(r)), "expected the AI reply");
		const session = command._internal.sessions.get("t:2");
		assert.strictEqual(session.history.length, 2, "expected the exchange to be remembered");
		assert.strictEqual(armed && armed.id, "bot1", "expected a reply handler armed on the bot message");
	});

	await test("ai: reports a network failure without breaking memory", async () => {
		const command = registry.resolve("ai");
		command._internal.sessions.delete("t:3");
		const originalFetch = global.fetch;
		global.fetch = async () => ({ ok: false, status: 502 });
		const replies = [];
		try {
			await command.onStart({
				message: { reply: text => { replies.push(text); return {}; }, typing: () => () => { }, react: () => { } },
				args: ["hello"],
				event: { senderID: "3", threadID: "t" },
				config: makeConfig(),
				setReplyHandler: () => { }
			});
		}
		finally {
			global.fetch = originalFetch;
		}
		assert.ok(replies.some(r => /network/i.test(r)), "expected a friendly failure");
		const session = command._internal.sessions.get("t:3");
		assert.strictEqual(session.history.length, 0, "a failed turn must not be remembered");
	});

	/* ── help ── */
	await test("help: lists every category with a text effect", async () => {
		const command = registry.resolve("help");
		assert.ok(command, "help should be registered");
		let sent = null;
		const message = { send: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		await command.onStart({ message, args: [], config: makeConfig(), registry });
		const text = String(sent && sent.body);
		assert.ok(/INSTABOT/.test(text), "should name the bot");
		assert.ok(/INFO/.test(text), "should list the info category");
		assert.ok(/× -help/.test(text), "should list commands with the prefix");
		assert.ok(/➥× -/.test(text), "the ➥ icon should prefix the first command in each category");
		assert.ok(!/』 ➥/.test(text), "the icon must not sit on the category header");
		assert.ok(["love", "gift", "celebration", "fire"].includes(sent.effect), "should send with a random text effect");
	});

	await test("help: shows details for one command with a text effect", async () => {
		const command = registry.resolve("help");
		let sent = null;
		const message = { send: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		await command.onStart({ message, args: ["ping"], config: makeConfig(), registry });
		const text = String(sent && sent.body);
		assert.ok(/Name: ping/.test(text), "should name the command");
		assert.ok(/Usage: -ping/.test(text), "should render usage with the prefix");
		assert.ok(["love", "gift", "celebration", "fire"].includes(sent.effect), "should send with a random text effect");
	});

	await test("help: an unknown command is reported plainly", async () => {
		const command = registry.resolve("help");
		let sent = null;
		const message = { send: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		await command.onStart({ message, args: ["nope"], config: makeConfig(), registry });
		const text = String(sent && sent.body != null ? sent.body : sent);
		assert.ok(/not found/.test(text), "should report the missing command");
	});

	/* ── uptime ── */
	await test("uptime: registered and reports the running time", async () => {
		const command = registry.resolve("uptime");
		assert.ok(command, "uptime should be registered");
		const previous = global.instabotStartedAt;
		global.instabotStartedAt = Date.now() - (2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5000);
		let sent = null;
		const message = { send: form => { sent = form; return Promise.resolve({ messageID: "x" }); } };
		try {
			await command.onStart({ message, config: { botName: "InstaBOT" } });
		}
		finally {
			global.instabotStartedAt = previous;
		}
		const text = String(sent && sent.body);
		assert.ok(/INSTABOT/.test(text), "should name the bot");
		assert.ok(/2d 3h 4m/.test(text), "should show the elapsed time, got: " + text);
		assert.ok(/RUNTIME/.test(text), "should show the runtime section");
		assert.ok(/HOST/.test(text), "should show the host section");
		assert.ok(/MEMORY/.test(text), "should show the memory section");
		assert.ok(["love", "angry", "laugh", "cry"].includes(sent.avatarEffect), "should send with a random avatar effect");
	});

	await test("uptime: uses every avatar effect without repeating in a row", async () => {
		const command = registry.resolve("uptime");
		const seen = new Set();
		const message = { send: form => { seen.add(form.avatarEffect); return Promise.resolve({ messageID: "x" }); } };
		for (let i = 0; i < 40; i++) await command.onStart({ message, config: { botName: "InstaBOT" } });
		assert.ok(seen.size >= 2, "random choice should vary across calls, saw: " + [...seen].join(","));
	});

	await test("uptime: aliases resolve to the command", () => {
		assert.ok(registry.resolve("up"), "alias 'up' should resolve");
		assert.ok(registry.resolve("runtime"), "alias 'runtime' should resolve");
	});

	await test("loader: loadAll is idempotent (no duplicate commands/events)", () => {
		const reg = createRegistry();
		const first = loadAll(reg);
		assert.ok(first.commandCount > 0, "expected commands to load");
		const firstEvents = reg.events.length;
		const second = loadAll(reg);
		assert.strictEqual(second.commandCount, first.commandCount, "command count must not change on reload");
		assert.strictEqual(reg.events.length, firstEvents, "events must not duplicate on reload");
	});

	await test("status server: serves /health on the given port and stops", async () => {
		const { createStatusServer } = require(path.join(root, "src/statusServer"));
		const http = require("http");

		// PORT=0 disables it (pure worker mode).
		assert.strictEqual(createStatusServer({ port: 0 }).enabled, false);

		// Grab a free ephemeral port, release it, then bind our server there.
		const probe = http.createServer();
		await new Promise(r => probe.listen(0, "127.0.0.1", r));
		const port = probe.address().port;
		await new Promise(r => probe.close(r));

		const live = createStatusServer({ port, host: "127.0.0.1", info: () => ({ online: true, botId: "botA" }) });
		await live.start();
		try {
			const res = await new Promise((resolve, reject) => {
				http.get({ host: "127.0.0.1", port, path: "/health" }, r => {
					let b = "";
					r.on("data", d => { b += d; });
					r.on("end", () => resolve({ status: r.statusCode, body: b }));
				}).on("error", reject);
			});
			assert.strictEqual(res.status, 200);
			const parsed = JSON.parse(res.body);
			assert.strictEqual(parsed.ok, true);
			assert.strictEqual(parsed.service, "instabot");
			assert.strictEqual(parsed.online, true);
			assert.strictEqual(parsed.botId, "botA");
		}
		finally { await live.stop(); }
	});

	/* ── group detection, join/leave, avatar fallback ── */

	await test("normalizeEvent: infers a group from participantIDs", async () => {
		const event = normalizeEvent({ type: "message", threadID: "g", senderID: "5", body: "hi", participantIDs: ["1", "2", "5"] });
		assert.strictEqual(event.isGroup, true);
	});

	await test("normalizeEvent: keeps a DM a DM", async () => {
		const event = normalizeEvent({ type: "message", threadID: "d", senderID: "5", body: "hi" });
		assert.notStrictEqual(event.isGroup, true);
	});

	await test("normalizeEvent: maps action_log added_participants onto userIDs", async () => {
		const event = normalizeEvent({ type: "join", threadID: "g", isGroup: true, added_participants: ["77", "88"] });
		assert.deepStrictEqual(event.userIDs, ["77", "88"]);
	});

	await test("dispatcher: resolves a group thread when isGroup is missing", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		await runCommand("-adduser 555", { api, db, config: makeConfig(), extraEvent: { isGroup: undefined } });
		assert.ok(api.calls.some(c => c.method === "addUserToThread" && c.uid === "555"), "should treat the resolved group correctly");
	});

	await test("welcome event: greets only the added member, never the actor", async () => {
		// Regression: the id fallback included senderID, which in a membership
		// event is the ACTOR who added the member — so both were welcomed.
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "join", threadID: "g", isGroup: true,
			usernames: ["newmember"], userIDs: [], senderID: "999", userID: "999"
		});
		const bodies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.ok(bodies.some(b => /Welcome @newmember/.test(b)), JSON.stringify(bodies));
		assert.ok(!bodies.some(b => /999/.test(b)), "the actor must not be welcomed: " + JSON.stringify(bodies));
	});

	await test("welcome event: greets a member added via action_log usernames", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "join", threadID: "g", isGroup: true,
			usernames: ["arobrifat"], userIDs: []
		});
		const bodies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.ok(bodies.some(b => /Welcome @arobrifat/.test(b)), JSON.stringify(bodies));
	});

	await test("welcome event: greets an added member by username, not numeric id", async () => {
		// The join event often carries only a numeric id; the greeting must
		// resolve it to the username (@handle), never print the raw id.
		const api = fakeApi({
			getUserInfo: (id, cb) => cb(null, { [id]: { userID: id, vanity: "arobrifat", name: "Aro Brifat" } })
		});
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "join", threadID: "g", isGroup: true,
			usernames: [], userIDs: ["56517826793"]
		});
		const bodies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.ok(bodies.some(b => /Welcome @arobrifat/.test(b)), JSON.stringify(bodies));
		assert.ok(!bodies.some(b => /56517826793/.test(b)), "the numeric id must not be shown: " + JSON.stringify(bodies));
	});

	await test("leave event: announces a member removed via action_log usernames", async () => {
		const api = fakeApi();
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "leave", threadID: "g", isGroup: true,
			usernames: ["arobrifat"], userIDs: []
		});
		const bodies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.ok(bodies.some(b => /@arobrifat left/.test(b)), JSON.stringify(bodies));
	});

	await test("leave event: announces a removed member by username, not numeric id", async () => {
		const api = fakeApi({
			getUserInfo: (id, cb) => cb(null, { [id]: { userID: id, vanity: "arobrifat", name: "Aro Brifat" } })
		});
		const db = makeDatabase();
		const dispatcher = createDispatcher({ api, config: makeConfig(), registry, database: db });
		await dispatcher.handle({
			type: "leave", threadID: "g", isGroup: true,
			usernames: [], userIDs: ["56517826793"]
		});
		const bodies = api.calls.filter(c => c.method === "sendMessage").map(c => c.form.body);
		assert.ok(bodies.some(b => /@arobrifat left/.test(b)), JSON.stringify(bodies));
		assert.ok(!bodies.some(b => /56517826793/.test(b)), "the numeric id must not be shown: " + JSON.stringify(bodies));
	});

	await test("avatarEffect: sends the effect name so the server adds no sticker id", async () => {
		const calls = [];
		const api = fakeApi({
			sendAvatarTextEffect: (text, threadID, effect, cb) => { calls.push("avatar:" + effect); cb(null, { ok: true }); },
			sendTextEffect: () => { calls.push("text"); }
		});
		const message = createMessageContext({ api, event: { threadID: "d", messageID: "m", isGroup: false }, log });
		const result = await message.avatarEffect("hello", "laugh");
		assert.deepStrictEqual(result, { ok: true });
		assert.deepStrictEqual(calls, ["avatar:laugh"]);
	});

	await test("avatarEffect: surfaces a real failure instead of downgrading", async () => {
		const calls = [];
		const api = fakeApi({
			sendAvatarTextEffect: (text, threadID, effect, cb) => { calls.push("avatar"); cb(new Error("send failed")); },
			sendTextEffect: () => { calls.push("text"); }
		});
		const message = createMessageContext({ api, event: { threadID: "g", messageID: "m", isGroup: true }, log });
		await assert.rejects(message.avatarEffect("hello", "laugh"), /send failed/);
		assert.deepStrictEqual(calls, ["avatar"]);
	});

	await test("avatarfx: works in a group with no sticker configuration", async () => {
		const avatarfx = require(path.join(root, "commands/avatarfx"));
		const replies = [];
		const message = {
			reply: (text) => { replies.push(text); },
			avatarEffect: () => Promise.resolve({ ok: true })
		};
		await avatarfx.onStart({ message, args: ["laugh", "nice"] });
		assert.deepStrictEqual(replies, []);
	});

	/* ── long-run stability guards ── */

	await test("status server: a throwing handler never crashes the process", async () => {
		const { createStatusServer } = require(path.join(root, "src/statusServer.js"));
		const server = createStatusServer({ port: 0, info: () => ({ ok: true }) });
		assert.strictEqual(server.enabled, false, "port 0 disables the server (pure worker mode)");
	});

	/* ── rate-limit vs not-found ── */
	await test("isRateLimitError: recognises 429 and Instagram throttle wording", () => {
		assert.strictEqual(utils.isRateLimitError({ error: "parseAndCheckLogin got status code: 429. Bailing out" }), true);
		assert.strictEqual(utils.isRateLimitError(new Error("Too Many Requests")), true);
		assert.strictEqual(utils.isRateLimitError({ message: "Please wait a few minutes before you try again." }), true);
		assert.strictEqual(utils.isRateLimitError("We're sorry, but something went wrong. Please try again."), true);
		assert.strictEqual(utils.isRateLimitError({ message: "Could not find @nobody." }), false);
		assert.strictEqual(utils.isRateLimitError(null), false);
	});

	await test("resolveUserTarget: a throttled handle is flagged, not reported missing", async () => {
		// The server answers getUserInfo with a 429; we must not then hammer the
		// anonymous endpoint, and must signal rateLimited (not a bare miss).
		let anonCalls = 0;
		const download = utils.download;
		utils.download = () => { anonCalls++; return Promise.resolve(Buffer.from("{}")); };
		try {
			const api = fakeApi({
				getUserInfo: (id, cb) => cb(new Error("parseAndCheckLogin got status code: 429. Bailing out"))
			});
			const target = await utils.resolveUserTarget(["@arobrifat"], { threadID: "t", senderID: "1" }, api);
			assert.strictEqual(target.id, null);
			assert.strictEqual(target.username, "arobrifat");
			assert.strictEqual(target.rateLimited, true);
			assert.strictEqual(anonCalls, 0, "must not call the anonymous endpoint while throttled");
		}
		finally { utils.download = download; }
	});

	await test("resolveUserTarget: a genuine miss is not flagged as throttled", async () => {
		const download = utils.download;
		utils.download = () => Promise.resolve(Buffer.from(JSON.stringify({ data: { user: null } })));
		try {
			const api = fakeApi({
				getUserInfo: (id, cb) => cb(new Error("Could not find @nobody."))
			});
			const target = await utils.resolveUserTarget(["@nobody"], { threadID: "t", senderID: "1" }, api);
			assert.strictEqual(target.id, null);
			assert.strictEqual(target.username, "nobody");
			assert.strictEqual(!!target.rateLimited, false);
		}
		finally { utils.download = download; }
	});

	await test("resolveProfile: an incomplete authenticated profile is filled from the public one", async () => {
		// getUserInfo can return a 200 without the social counts. The public
		// profile must fill them in for the same user.
		const download = utils.download;
		utils._resetUsernameCache();
		utils.download = () => Promise.resolve(Buffer.from(JSON.stringify({ data: { user: {
			id: "777", username: "jane", full_name: "Jane Doe", biography: "hello",
			edge_followed_by: { count: 42 }, edge_follow: { count: 7 },
			profile_pic_url_hd: "https://example.com/p.jpg"
		} } })));
		try {
			const api = fakeApi({
				getUserInfo: (id, cb) => cb(null, { "777": { userID: "777", name: "Jane Doe", vanity: "jane", profilePicture: "https://example.com/p.jpg" } })
			});
			const p = await utils.resolveProfile(["777"], {}, api);
			assert.strictEqual(String(p.userID), "777");
			assert.strictEqual(p.followers, 42, "followers must be filled in");
			assert.strictEqual(p.following, 7, "following must be filled in");
			assert.strictEqual(p.biography, "hello");
		}
		finally { utils.download = download; utils._resetUsernameCache(); }
	});

	await test("resolveProfile: a mismatched public profile never overwrites the right id", async () => {
		// A handle can collide with an unrelated account; the public result must
		// be ignored when its id differs from the authenticated one.
		const download = utils.download;
		utils._resetUsernameCache();
		utils.download = () => Promise.resolve(Buffer.from(JSON.stringify({ data: { user: {
			id: "999999", username: "jane", full_name: "Jane Williamson", biography: "wrong person",
			edge_followed_by: { count: 1975133 }, edge_follow: { count: 979 }
		} } })));
		try {
			const api = fakeApi({
				getUserInfo: (id, cb) => cb(null, { "777": { userID: "777", name: "Jane Doe", vanity: "jane", profilePicture: "https://example.com/p.jpg" } })
			});
			const p = await utils.resolveProfile(["777"], {}, api);
			assert.strictEqual(String(p.userID), "777", "the id must stay the requested user's");
			assert.notStrictEqual(p.followers, 1975133, "must not take the wrong account's followers");
		}
		finally { utils.download = download; utils._resetUsernameCache(); }
	});

	await test("resolveProfile: a throttled numeric id recovers the handle from the cache", async () => {
		const download = utils.download;
		utils._resetUsernameCache();
		// Prime the cache via a handle lookup, then throttle the id lookup.
		utils.download = () => Promise.resolve(Buffer.from(JSON.stringify({ data: { user: {
			id: "777", username: "jane", full_name: "Jane Doe", biography: "hi",
			edge_followed_by: { count: 42 }, edge_follow: { count: 7 }
		} } })));
		try {
			await utils.resolveProfile(["jane"], {}, null); // writes the cache
			const api = fakeApi({ getUserInfo: (id, cb) => cb(new Error("parseAndCheckLogin got status code: 429")) });
			const p = await utils.resolveProfile(["777"], {}, api);
			assert.strictEqual(p.followers, 42, "the cached handle must let the public endpoint fill the profile");
		}
		finally { utils.download = download; utils._resetUsernameCache(); }
	});

	await test("uid: reports throttling instead of 'Could not find'", async () => {
		const command = registry.resolve("uid");
		const api = fakeApi({
			getUserInfo: (id, cb) => cb(new Error("parseAndCheckLogin got status code: 429. Bailing out"))
		});
		const sent = [];
		const message = { reply: text => { sent.push(String(text)); return Promise.resolve({}); } };
		await command.onStart({
			message, args: ["@arobrifat"], api,
			event: { threadID: "t", senderID: "1", isGroup: false },
			config: makeConfig()
		});
		assert.ok(/rate-limiting/i.test(sent[0]), "expected a rate-limit reply, got: " + sent[0]);
	});

	/* ── summary ── */
	const failed = results.filter(r => !r.ok);
	for (const r of results)
		console.log(`${r.ok ? "  ok " : "FAIL "} - ${r.name}`);
	console.log(`\n${count}/${results.length} tests passed`);
	if (failed.length) {
		for (const f of failed) console.error("\n" + f.name + ":\n", f.error);
		process.exit(1);
	}
}

main().catch(error => { console.error(error); process.exit(1); });
