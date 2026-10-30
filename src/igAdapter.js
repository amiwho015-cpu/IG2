"use strict";

/**
 * igAdapter — runs InstaBOT on the vendored instachat-api client.
 *
 * InstaBOT's commands were written against a GoatBot/fca-style `api`
 * (api.sendMessage(form, threadID, cb, replyTo), api.listenMqtt(cb), ...).
 * This adapter exposes exactly that surface, implemented on top of
 * lib/instachat-api (promise based, polling, throttled sends), so no command has to change.
 *
 * Every method works with a node-style callback AND as a promise.
 */

const fs = require("fs");
const path = require("path");
const log = require("./logger");

const { InstaChatClient, Events } = require("../lib/instachat-api/src");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const str = v => (v == null ? "" : String(v));

/** Run `fn()` (async) and deliver the result through an optional node-style callback. */
function bridge(fn, cb) {
	const job = Promise.resolve().then(fn);
	if (typeof cb === "function") {
		job.then(result => cb(null, result), error => cb(error));
		return Promise.resolve();
	}
	return job;
}

/** Find the callback among trailing args (fca methods take it in different positions). */
const findCb = (...args) => args.find(a => typeof a === "function");

function unsupported(feature) {
	const error = new Error(`${feature} is not supported by the Instagram web API (instachat-api).`);
	error.code = "UNSUPPORTED_FEATURE";
	return error;
}

/** Cookie list ([{key,value}]) or cookie map -> plain { name: value } map. */
function cookiesToMap(cookies) {
	if (!cookies) return {};
	if (Array.isArray(cookies)) {
		const map = {};
		for (const c of cookies) {
			const key = c && (c.key || c.name);
			if (key && c.value !== undefined) map[key] = String(c.value);
		}
		return map;
	}
	return Object.assign({}, cookies);
}

function mapUser(user, fallbackId) {
	const u = user || {};
	const id = str(u.id || u.pk || fallbackId);
	const name = u.fullName || u.username || id;
	return {
		userID: id,
		id,
		name,
		firstName: str(name).split(/\s+/)[0] || name,
		vanity: u.username || "",
		username: u.username || "",
		profileUrl: u.username ? `https://www.instagram.com/${u.username}/` : "",
		thumbSrc: u.profilePicUrl || "",
		profilePicture: u.profilePicUrl || "",
		biography: u.biography || u.bio || "",
		followerCount: u.followerCount != null ? u.followerCount : (u.followers != null ? u.followers : undefined),
		followingCount: u.followingCount != null ? u.followingCount : (u.following != null ? u.following : undefined),
		isVerified: Boolean(u.isVerified),
		isPrivate: Boolean(u.isPrivate),
		isFriend: Boolean(u.friendship && u.friendship.following && u.friendship.followedBy),
		gender: 0,
		type: "user"
	};
}

/**
 * Connect and return the fca-style api.
 *
 * @param {Object} params
 * @param {Array|Object} params.cookies   Cookies from account.txt.
 * @param {Function} [params.reloadCookies] () => cookies; used by api.reloadSession().
 * @param {Object} params.config          InstaBOT config.
 */
async function login(params) {
	const { cookies, reloadCookies, config = {}, ClientClass } = params;
	const settings = Object.assign({}, config.instachat || {});

	const map = cookiesToMap(cookies);
	if (!map.sessionid) throw new Error("account.txt has no sessionid cookie");

	const dataDir = (config.database && config.database.dir) || "data";
	try { fs.mkdirSync(dataDir, { recursive: true }); } catch (_) { /* ignore */ }

	const clientOptions = {
		cookies: map,
		userId: map.ds_user_id || map.userid,
		sessionPath: path.resolve(dataDir, "ig-session.json"),
		pollIntervalMs: Math.max(1000, Number(settings.pollIntervalMs) || 2500),
		idlePollIntervalMs: Math.max(1000, Number(settings.idlePollIntervalMs) || 8000),
		adaptivePolling: settings.adaptivePolling !== false,
		throttle: settings.throttle === false ? false : Object.assign({ minGapMs: 450, perThreadGapMs: 700, jitterMs: 150 }, settings.throttle || {}),
		requestTimeoutMs: Number(settings.requestTimeoutMs) || 20000,
		maxRetries: settings.maxRetries != null ? Number(settings.maxRetries) : 2,
		debug: settings.debug === true
	};
	if (config.account && config.account.userAgent) clientOptions.userAgent = config.account.userAgent;

	const client = new (ClientClass || InstaChatClient)(clientOptions);
	const selfListen = config.selfListen !== false;

	// messageID -> threadID. Many fca-style calls (react, unsend, edit) only give a message id.
	const threadOf = new Map();
	const remember = (messageID, threadID) => {
		if (!messageID || !threadID) return;
		threadOf.set(str(messageID), str(threadID));
		if (threadOf.size > 20000) threadOf.delete(threadOf.keys().next().value);
	};
	// messageID -> { senderId, text }: lets a reply resolve WHO it replies to even when
	// Instagram's payload carries only the quoted message id (this is what the reply-to-
	// target commands like kill/slap/hug read as event.messageReply.senderID).
	const metaOf = new Map();
	const rememberMeta = (messageID, senderId, text) => {
		if (!messageID) return;
		const key = str(messageID);
		const prev = metaOf.get(key) || {};
		metaOf.set(key, { senderId: senderId ? str(senderId) : prev.senderId, text: text || prev.text || "" });
		if (metaOf.size > 20000) metaOf.delete(metaOf.keys().next().value);
	};
	const sentByBot = new Set();
	const rememberSent = id => {
		if (!id) return;
		sentByBot.add(str(id));
		if (sentByBot.size > 5000) sentByBot.delete(sentByBot.values().next().value);
	};
	const resolveThread = (messageID, threadID) => {
		const t = threadID != null && threadID !== "" ? str(threadID) : threadOf.get(str(messageID));
		if (!t) throw new Error(`Unknown thread for message ${messageID} (the bot has not seen it yet)`);
		return t;
	};

	await client.connect();
	log.success("LOGIN", `instachat-api connected as @${client.username || "?"} (${client.userId})`);

	const api = {
		client, // escape hatch for new commands: api.client.sendHuman(...), api.client.awaitMessage(...), ...
		_userID: str(client.userId),
		getCurrentUserID: () => str(client.userId),
		getAppState: () => client.session && client.session.cookies ? Object.entries(client.session.cookies).map(([key, value]) => ({ key, value })) : [],
		isPowerApi: true
	};

	// ---------- sending ----------

	function toResult(res, threadID) {
		const id = res && (res.id || res.messageID || res.messageId || res.item_id);
		if (id) { remember(id, threadID); rememberSent(id); rememberMeta(id, client.userId, ""); }
		const out = { threadID: str(threadID), messageID: id ? str(id) : null, timestamp: (res && res.timestamp) || Date.now() };
		if (res && Array.isArray(res.attachments) && res.attachments.length) out.attachments = res.attachments;
		if (res && res.textMessage) {
			const tid = res.textMessage.id || res.textMessage.messageID;
			if (tid) { remember(tid, threadID); rememberSent(tid); }
		}
		if (res && Array.isArray(res.attachmentMessages)) {
			for (const m of res.attachmentMessages) {
				const aid = m && (m.id || m.messageID);
				if (aid) { remember(aid, threadID); rememberSent(aid); }
			}
		}
		return out;
	}

	api.sendMessage = function sendMessage(form, threadID, ...rest) {
		const cb = findCb(...rest);
		const reply = rest.find(a => typeof a === "string" && a) || undefined;
		return bridge(async () => {
			const tid = str(threadID);
			if (!tid) throw new Error("sendMessage: threadID is required");
			let payload = form;
			if (form && typeof form === "object" && !Buffer.isBuffer(form) && typeof form.pipe !== "function") {
				const { body, attachment, attachments, mentions } = form;
				payload = {};
				if (body != null && String(body).length) payload.body = String(body);
				const att = attachments || attachment;
				if (att) payload.attachments = Array.isArray(att) ? att : [att];
				if (!payload.body && !payload.attachments) payload.body = " ";
				if (mentions && !Array.isArray(mentions) && typeof mentions === "object") {
					payload.mentions = Object.entries(mentions).map(([userId, username]) => ({ userId, username }));
				}
			}
			const res = reply
				? await client.reply(tid, reply, payload)
				: await client.sendMessage(tid, payload);
			return toResult(res, tid);
		}, cb);
	};

	api.setMessageReaction = function setMessageReaction(emoji, messageID, ...rest) {
		const cb = findCb(...rest);
		const explicitThread = rest.find(a => typeof a === "string" && a);
		return bridge(async () => {
			const tid = resolveThread(messageID, explicitThread);
			if (!emoji) return client.deleteReaction(tid, str(messageID));
			return client.sendReaction(tid, str(messageID), String(emoji));
		}, cb);
	};

	api.unsendMessage = function unsendMessage(messageID, ...rest) {
		const cb = findCb(...rest);
		const explicitThread = rest.find(a => typeof a === "string" || typeof a === "number");
		return bridge(async () => {
			const raw = str(messageID);
			const tid = resolveThread(raw.includes(":") ? raw.split(":")[1] : raw, explicitThread != null ? explicitThread : (raw.includes(":") ? raw.split(":")[0] : undefined));
			return client.unsendMessage(tid, raw.includes(":") ? raw.split(":")[1] : raw);
		}, cb);
	};

	api.editMessage = function editMessage(newText, messageID, ...rest) {
		const cb = findCb(...rest);
		const explicitThread = rest.find(a => typeof a === "string" && a);
		return bridge(async () => {
			const tid = resolveThread(messageID, explicitThread);
			return client.editMessage(tid, str(messageID), String(newText));
		}, cb);
	};

	// Typing: returns a stop() function like fca does.
	api.sendTypingIndicator = function sendTypingIndicator(threadID, ...rest) {
		const cb = findCb(...rest);
		const tid = str(threadID);
		client.sendTypingIndicator(tid, true).then(() => cb && cb(null), error => cb && cb(error));
		return () => { client.sendTypingIndicator(tid, false).catch(() => { }); };
	};

	api.markAsRead = (threadID, ...rest) => bridge(async () => {
		const tid = str(threadID);
		const last = [...threadOf.entries()].reverse().find(([, t]) => t === tid);
		if (last) return client.markSeen(tid, last[0]);
		return null;
	}, findCb(...rest));

	// ---------- lookups ----------

	const userCache = new Map(); // key -> { at, value }
	const seenProfiles = new Map(); // userID/username -> basic profile learned from group member lists
	const learnProfile = value => {
		if (!value || !value.userID) return;
		seenProfiles.set(value.userID, value);
		if (value.username) seenProfiles.set(String(value.username).toLowerCase(), value);
		if (seenProfiles.size > 5000) seenProfiles.delete(seenProfiles.keys().next().value);
	};
	const USER_TTL = 60 * 60 * 1000;          // a profile is fresh for 1 hour
	const inflight = new Map();               // key -> Promise (one request for many callers)
	let lookupBlockedUntil = 0;               // after a 429, lookups fail fast until this time

	const isRateLimited = e => !!e && (e.status === 429 || e.code === "RATE_LIMIT" || /\b429\b|rate.?limit|too many requests|feedback/i.test(String(e.message || e)));

	async function lookupUser(idOrName) {
		const key = str(idOrName).replace(/^@/, "").toLowerCase();
		const hit = userCache.get(key);
		if (hit && Date.now() - hit.at < USER_TTL) return hit.value;
		// The bot's own account is already known from login: never spend a request on it.
		if (key === str(client.userId).toLowerCase() || (client.username && key === String(client.username).toLowerCase())) {
			const me = mapUser({ id: client.userId, username: client.username, fullName: client.fullName || client.username }, str(client.userId));
			userCache.set(key, { at: Date.now(), value: me });
			return me;
		}
		// Instagram just throttled us: answer from the (stale) cache or fail at once
		// instead of making every command wait for another 429.
		if (Date.now() < lookupBlockedUntil) {
			if (hit) return hit.value;
			if (seenProfiles.has(key)) return seenProfiles.get(key);
			const wait = Math.ceil((lookupBlockedUntil - Date.now()) / 1000);
			throw Object.assign(new Error(`Instagram rate limit (429): lookups paused, retry in ~${wait}s`), { status: 429, code: "RATE_LIMIT" });
		}
		if (inflight.has(key)) return inflight.get(key);
		const numeric = /^\d+$/.test(key);
		const job = (async () => {
			try {
				const user = numeric ? await client.getUserById(key) : await client.getUserByUsername(key);
				const value = mapUser(user, numeric ? key : undefined);
				userCache.set(key, { at: Date.now(), value });
				if (value.userID) userCache.set(value.userID, { at: Date.now(), value });
				return value;
			}
			catch (error) {
				if (isRateLimited(error)) {
					const ra = Number(error && (error.retryAfter || (error.details && error.details.retryAfter))) || 0;
					lookupBlockedUntil = Date.now() + Math.min(180000, Math.max(30000, ra * 1000));
					log.warn("LOOKUP", `Instagram rate limit, lookups paused for ${Math.round((lookupBlockedUntil - Date.now()) / 1000)}s`);
					if (hit) return hit.value;
					if (seenProfiles.has(key)) return seenProfiles.get(key);
				}
				throw error;
			}
			finally { inflight.delete(key); }
		})();
		inflight.set(key, job);
		return job;
	}

	api.getUserInfo = function getUserInfo(ids, ...rest) {
		const cb = findCb(...rest);
		return bridge(async () => {
			const list = (Array.isArray(ids) ? ids : [ids]).map(str).filter(Boolean);
			const out = {};
			let lastError = null;
			for (const id of list) {
				try {
					const profile = await lookupUser(id);
					out[profile.userID || id] = profile;
				}
				catch (error) { lastError = error; }
			}
			if (!Object.keys(out).length && lastError) throw lastError;
			return out;
		}, cb);
	};

	api.getDiagnostics = () => ({
		username: client.username || null,
		userId: str(client.userId),
		pollDelayMs: client.realtime ? client.realtime.currentDelayMs : null,
		pollErrors: client.realtime ? client.realtime.consecutiveErrors : null,
		pollRunning: client.realtime ? !!client.realtime.isRunning : null,
		lookupPausedForSec: Math.max(0, Math.ceil((lookupBlockedUntil - Date.now()) / 1000)),
		cachedProfiles: userCache.size,
		cachedThreads: threadCache.size,
		knownMessages: metaOf.size
	});

	api.searchUsers = function searchUsers(query, ...rest) {
		return bridge(async () => {
			const users = await client.searchUsers(String(query), { limit: 15 });
			return (users || []).map(u => mapUser(u));
		}, findCb(...rest));
	};

	function mapThread(conv, threadID) {
		const me = str(client.userId);
		const participants = Array.isArray(conv.participants) ? conv.participants : [];
		const ids = participants.map(p => str(p.id)).filter(Boolean);
		if (me && !ids.includes(me)) ids.push(me);
		return {
			threadID: str(conv.id || threadID),
			threadName: conv.isGroup ? (conv.title || "") : "",
			name: conv.isGroup ? (conv.title || "") : "",
			isGroup: Boolean(conv.isGroup),
			participantIDs: ids,
			userInfo: participants.map(p => { const v = mapUser(p); learnProfile(v); return v; }),
			adminIDs: (conv.adminUserIds || []).map(id => ({ id: str(id) })),
			emoji: null,
			imageSrc: conv.imageUrl || null,
			nicknames: conv.nicknames || {},
			muted: Boolean(conv.muted),
			messageCount: Array.isArray(conv.messages) ? conv.messages.length : 0
		};
	}

	const threadCache = new Map(); // threadID -> { at, value }
	const threadInflight = new Map();
	const THREAD_TTL = 45 * 1000;
	api.getThreadInfo = function getThreadInfo(threadID, ...rest) {
		return bridge(async () => {
			const tid = str(threadID);
			const hit = threadCache.get(tid);
			if (hit && Date.now() - hit.at < THREAD_TTL) return hit.value;
			if (threadInflight.has(tid)) return threadInflight.get(tid);
			const job = (async () => {
				try {
					const value = mapThread(await client.getConversation(tid), threadID);
					threadCache.set(tid, { at: Date.now(), value });
					if (threadCache.size > 300) threadCache.delete(threadCache.keys().next().value);
					return value;
				}
				catch (error) { if (hit) return hit.value; throw error; }
				finally { threadInflight.delete(tid); }
			})();
			threadInflight.set(tid, job);
			return job;
		}, findCb(...rest));
	};

	api.getThreadList = function getThreadList(limit, timestamp, tags, ...rest) {
		const cb = [limit, timestamp, tags, ...rest].find(a => typeof a === "function");
		return bridge(async () => {
			const folders = (Array.isArray(tags) ? tags : [tags]).map(t => str(t).toUpperCase());
			const wantPending = folders.some(f => f === "PENDING" || f === "OTHER");
			const n = Math.max(1, Math.min(Number(limit) || 20, 500));
			let conversations;
			if (wantPending) {
				const res = await client.getPendingConversations({ limit: n });
				conversations = Array.isArray(res) ? res : (res && res.conversations) || [];
			}
			else {
				conversations = (await client.getConversations({ limit: n })) || [];
			}
			return conversations.map(c => mapThread(c));
		}, cb);
	};

	api.getFriendsList = function getFriendsList(...rest) {
		return bridge(async () => {
			const res = await client.getFollowing(str(client.userId), { limit: 250 });
			const users = Array.isArray(res) ? res : (res && (res.users || res.items)) || [];
			return users.map(u => mapUser(u));
		}, findCb(...rest));
	};

	// ---------- group management ----------

	const addUsers = (userID, threadID, ...rest) => bridge(
		() => client.addParticipants(str(threadID), (Array.isArray(userID) ? userID : [userID]).map(str)), findCb(...rest));
	const removeUsers = (userID, threadID, ...rest) => bridge(
		() => client.removeParticipant(str(threadID), (Array.isArray(userID) ? userID : [userID]).map(str)), findCb(...rest));

	api.addUserToGroup = api.addUserToThread = addUsers;
	api.removeUserFromGroup = api.removeUserFromThread = removeUsers;
	api.setTitle = (title, threadID, ...rest) => bridge(() => client.setThreadTitle(str(threadID), String(title)), findCb(...rest));
	api.changeAdminStatus = (threadID, userID, admin, ...rest) => bridge(
		() => (admin ? client.promoteAdmin : client.demoteAdmin).call(client, str(threadID), (Array.isArray(userID) ? userID : [userID]).map(str)), findCb(...rest));
	api.changeNickname = (nickname, threadID, userID, ...rest) => bridge(
		() => (nickname ? client.setNickname(str(threadID), str(userID), String(nickname)) : client.clearNickname(str(threadID), str(userID))), findCb(...rest));

	api.handleMessageRequest = function handleMessageRequest(threadID, accept, ...rest) {
		return bridge(() => (accept === false
			? client.declineMessageRequest(str(threadID))
			: client.acceptMessageRequest(str(threadID))), findCb(...rest));
	};

	api.follow = api.followUser = (userID, ...rest) => bridge(() => client.followUser(str(userID)), findCb(...rest));
	api.unfollow = api.unfollowUser = (userID, ...rest) => bridge(() => client.unfollowUser(str(userID)), findCb(...rest));
	api.leaveThread = api.leaveGroup = (threadID, ...rest) => bridge(() => client.leaveThread(str(threadID)), findCb(...rest));
	api.deleteThread = (threadID, ...rest) => bridge(() => client.deleteThread(str(threadID)), findCb(...rest));

	// Things the Instagram web API cannot do: fail clearly instead of silently.
	for (const [name, label] of [
		["changeBio", "Changing the bio"],
		["changeProfilePicture", "Changing the profile picture"],
		["changeThreadEmoji", "Changing the thread emoji"],
		["sendMusic", "Sending Instagram music"],
		["searchMusic", "Instagram music search"]
	]) {
		api[name] = (...args) => {
			const cb = findCb(...args);
			const error = unsupported(label);
			if (cb) { cb(error); return Promise.resolve(); }
			return Promise.reject(error);
		};
		api[name]._unsupported = true;
	}

	api.logout = async () => { await client.disconnect(); };

	/**
	 * Re-read cookies (account.txt) into the live session and make sure polling is running.
	 * Used after "session no longer valid" so a repasted cookie is picked up without a redeploy.
	 */
	api.reloadSession = async function reloadSession() {
		if (typeof reloadCookies !== "function") return false;
		const fresh = cookiesToMap(await reloadCookies());
		if (!fresh.sessionid) return false;
		client.session.load({ userId: fresh.ds_user_id || fresh.userid || client.userId, cookies: fresh });
		if (!(await client.checkSession())) return false;
		if (!client.realtime.isRunning) client.realtime.start();
		client.isConnected = true;
		client.isReady = true;
		log.success("LOGIN", "Session reloaded from account.txt");
		return true;
	};

	// ---------- events ----------

	function mapAttachments(msg) {
		const out = [];
		if (msg.media && (msg.media.url || msg.media.type)) {
			const m = msg.media;
			out.push({ type: m.type || "image", url: m.url || null, previewUrl: m.url || null, width: m.width || null, height: m.height || null, duration: m.duration || null, ID: msg.id });
		}
		if (msg.share && (msg.share.url || msg.share.type)) {
			out.push(Object.assign({ type: "share" }, msg.share, { ID: msg.id }));
		}
		return out;
	}

	function mapMention(msg) {
		const out = {};
		for (const m of msg.mentions || []) if (m.userId) out[m.userId] = m.username ? `@${m.username}` : m.userId;
		return out;
	}

	function rawReplySender(msg) {
		const raw = msg.raw || {};
		const rep = raw.replied_to_message || raw.reply_to_message || raw.reply_source_message || {};
		if (rep.is_sent_by_viewer === true) return str(client.userId);
		const cand = rep.user_id || rep.sender_igid || rep.sender_id || rep.sender_fbid ||
			(rep.sender && (rep.sender.igid || rep.sender.id)) ||
			raw.replied_to_user_id || raw.reply_to_user_id || raw.replied_to_message_user_id;
		return cand ? str(cand) : "";
	}

	async function resolveReplySender(msg) {
		const rid = str(msg.replyTo.id);
		let sender = msg.replyTo.senderId && str(msg.replyTo.senderId);
		let text = msg.replyTo.text || "";
		if (!sender) sender = rawReplySender(msg);
		const meta = metaOf.get(rid);
		if (!sender && meta && meta.senderId) sender = meta.senderId;
		if (!text && meta && meta.text) text = meta.text;
		if (!sender || !text) {
			// Last resort: read the recent thread history once and find the quoted message there.
			try {
				const conv = await Promise.race([
					client.getConversation(str(msg.threadId)),
					new Promise((_, rej) => setTimeout(() => rej(new Error("history lookup timed out")), 5000))
				]);
				for (const m of (conv && conv.messages) || []) {
					const mid = str(m && (m.id || m.itemId));
					if (!mid) continue;
					const sid = m.senderId || m.userId || (m.sender && m.sender.id);
					if (sid) rememberMeta(mid, sid, m.text || "");
				}
				const found = metaOf.get(rid);
				if (found) { if (!sender && found.senderId) sender = found.senderId; if (!text && found.text) text = found.text; }
			}
			catch (_) { /* keep what we have */ }
		}
		return { sender: sender || "", text };
	}

	function messageEvent(msg, replied) {
		const event = {
			type: "message",
			threadID: str(msg.threadId),
			messageID: str(msg.id),
			senderID: str(msg.senderId),
			body: msg.text || "",
			attachments: mapAttachments(msg),
			mentions: mapMention(msg),
			timestamp: msg.timestamp,
			isSelf: Boolean(msg.isSelf),
			messageType: msg.type
		};
		if (msg.replyTo && msg.replyTo.id) {
			event.repliedToMessage = {
				messageID: str(msg.replyTo.id),
				senderID: replied ? replied.sender : str(msg.replyTo.senderId),
				body: replied ? replied.text : (msg.replyTo.text || ""),
				attachments: [],
				timestamp: null
			};
		}
		return event;
	}

	const listeners = new Set();
	const emitToListeners = (error, event) => {
		for (const fn of [...listeners]) {
			try { fn(error, event); }
			catch (e) { log.error("LISTEN", "listener threw", e); }
		}
	};

	client.on(Events.MESSAGE, async msg => {
		if (!msg) return;
		remember(msg.id, msg.threadId);
		rememberMeta(msg.id, msg.isSelf ? client.userId : msg.senderId, msg.text || "");
		if (msg.isSelf) {
			// Our own sends come back through polling; give send() a moment to register the id,
			// then only deliver messages typed from another device (and only with selfListen).
			await sleep(1500);
			if (!selfListen || sentByBot.has(str(msg.id))) return;
		}
		let replied = null;
		if (msg.replyTo && msg.replyTo.id) replied = await resolveReplySender(msg);
		emitToListeners(null, messageEvent(msg, replied));
	});

	client.on(Events.REACTION, r => {
		if (!r || r.isSelf) return;
		remember(r.messageId, r.threadId);
		emitToListeners(null, {
			type: "message_reaction",
			threadID: str(r.threadId),
			messageID: str(r.messageId),
			senderID: str(r.senderId),
			userID: str(r.senderId),
			reaction: r.emoji,
			timestamp: r.timestamp
		});
	});

	client.on(Events.MESSAGE_UNSENT, u => {
		if (!u || sentByBot.has(str(u.messageId))) return;
		emitToListeners(null, {
			type: "message_unsend",
			threadID: str(u.threadId),
			messageID: str(u.messageId),
			senderID: str(u.senderId),
			deletionTimestamp: u.timestamp
		});
	});

	client.on(Events.PARTICIPANTS_CHANGED, change => {
		if (!change) return;
		const base = { threadID: str(change.threadId), isGroup: true, timestamp: change.timestamp };
		const pack = users => ({
			userIDs: users.map(u => str(u.id)),
			usernames: users.map(u => u.username).filter(Boolean).map(n => `@${String(n).replace(/^@/, "")}`),
			participantID: users[0] ? str(users[0].id) : undefined,
			participantIDs: users.map(u => str(u.id))
		});
		if (change.added && change.added.length) emitToListeners(null, Object.assign({ type: "join" }, base, pack(change.added)));
		if (change.removed && change.removed.length) emitToListeners(null, Object.assign({ type: "leave" }, base, pack(change.removed)));
	});

	client.on(Events.READ_RECEIPT, r => r && emitToListeners(null, {
		type: "read_receipt", threadID: str(r.threadId), senderID: str(r.userId), reader: str(r.userId), time: r.timestamp
	}));

	client.on(Events.TYPING, t => t && emitToListeners(null, Object.assign({ type: "typ" }, {
		threadID: str(t.threadId), from: str(t.userId || t.senderId), isTyping: t.isTyping !== false
	})));

	client.on(Events.AUTH_ERROR, error => {
		emitToListeners(Object.assign(new Error(`login_required: ${error && error.message}`), { code: error && error.code }), null);
	});
	client.on(Events.RATE_LIMIT, error => log.warn("LISTEN", `Instagram rate limit; backing off ${error && error.retryAfter || "?"}s`));
	client.on(Events.RECOVERED, () => log.success("LISTEN", "Connection recovered"));
	client.on(Events.ERROR, error => log.warn("LISTEN", `poll error: ${error && error.message}`));

	/**
	 * fca-compatible listener. The underlying client keeps polling for the life of the process,
	 * so "stopping" a listener only detaches the callback (cheap, no sockets to leak).
	 */
	api.listenMqtt = function listenMqtt(callback) {
		if (typeof callback !== "function") throw new TypeError("listenMqtt requires a callback");
		listeners.add(callback);
		return function stopListening() { listeners.delete(callback); };
	};
	api.listen = api.listenMqtt;

	api.getSessionHealth = () => ({
		connected: client.isConnected,
		ready: client.isReady,
		consecutiveErrors: client.realtime.consecutiveErrors,
		pollDelayMs: client.realtime.currentDelayMs
	});

	return api;
}

module.exports = { login, mapUser, cookiesToMap };
