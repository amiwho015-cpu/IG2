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
		profilePicture: u.profilePicUrlHd || u.profilePicUrl || "",
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
		pollIntervalMs: Math.max(300, Number(settings.pollIntervalMs) || 2500),
		idlePollIntervalMs: Math.max(300, Number(settings.idlePollIntervalMs) || 8000),
		adaptivePolling: settings.adaptivePolling !== false,
		throttle: settings.throttle === false ? false : Object.assign({ minGapMs: 450, perThreadGapMs: 700, jitterMs: 150 }, settings.throttle || {}),
		requestTimeoutMs: Number(settings.requestTimeoutMs) || 20000,
		maxRetries: settings.maxRetries != null ? Number(settings.maxRetries) : 2,
		debug: settings.debug === true
	};
	// Realtime push (MQTT over WebSocket). Off by default; polling stays as the safety net.
	if (settings.mqtt != null) clientOptions.mqtt = settings.mqtt;
	if (settings.mqttMode) clientOptions.mqttMode = settings.mqttMode;
	if (config.account && config.account.userAgent) clientOptions.userAgent = config.account.userAgent;
	try {
		const session = require("./config").loadSessionJson();
		if (session) clientOptions.mobileSession = session;
	}
	catch (_) { /* session.json is optional */ }

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
	// messageID -> attachments: so a reply to a photo/video can hand the media to the command
	// (Instagram's reply payload only carries the quoted message id, never its media).
	const attsOf = new Map();
	const rememberAtts = (messageID, list) => {
		if (!messageID || !Array.isArray(list) || !list.length) return;
		attsOf.set(str(messageID), list);
		if (attsOf.size > 3000) attsOf.delete(attsOf.keys().next().value);
	};
	const sentByBot = new Set();
	const rememberSent = (id, threadID) => {
		if (!id) return;
		sentByBot.add(str(id));
		// Make the poller check this thread for reactions quickly (react-to-unsend needs it).
		try { if (client.realtime && client.realtime.watchReactionMessage) client.realtime.watchReactionMessage(str(threadID || threadOf.get(str(id)) || ""), str(id)); } catch (_) { /* optional */ }
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

	const lastBotSendAt = new Map();   // threadID -> time of the bot's latest message there
	function toResult(res, threadID, sentText) {
		lastBotSendAt.set(str(threadID), Date.now());
		const id = res && (res.id || res.messageID || res.messageId || res.item_id);
		if (id) { remember(id, threadID); rememberSent(id, threadID); rememberMeta(id, client.userId, sentText || ""); }
		const out = { threadID: str(threadID), messageID: id ? str(id) : null, timestamp: (res && res.timestamp) || Date.now() };
		if (res && Array.isArray(res.attachments) && res.attachments.length) out.attachments = res.attachments;
		if (res && res.textMessage) {
			const tid = res.textMessage.id || res.textMessage.messageID;
			if (tid) { remember(tid, threadID); rememberSent(tid, threadID); }
		}
		if (res && Array.isArray(res.attachmentMessages)) {
			for (const m of res.attachmentMessages) {
				const aid = m && (m.id || m.messageID);
				if (aid) { remember(aid, threadID); rememberSent(aid, threadID); }
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
			try { log.info("SEND", `pid ${process.pid} thread ${tid} ${reply ? "reply" : "send"}: ${String(typeof payload === "string" ? payload : (payload && payload.body) || (payload && payload.attachments ? "[attachment]" : "")).slice(0, 40)}`); } catch (_) { /* log only */ }
			const res = reply
				? await client.reply(tid, reply, payload)
				: await client.sendMessage(tid, payload);
			return toResult(res, tid, typeof payload === "string" ? payload : (payload && payload.body) || "");
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

	// HD profile picture URLs (largest first) through the bot's own authenticated session -
	// the same transport the rest of the bot already uses, so it works whenever the bot works.
	api.getHdPictureUrls = async function getHdPictureUrls(userID) {
		const id = str(userID).replace(/^@/, "");
		if (!/^\d+$/.test(id) || Date.now() < lookupBlockedUntil) return [];
		const { Endpoints } = require("../lib/instachat-api/src");
		let res;
		try { res = await client.transport.get(Endpoints.USER_INFO(id), { maxRetries: 0 }); }
		catch (error) {
			if (isRateLimited(error)) { lookupBlockedUntil = Date.now() + 30000; return []; }
			try { res = await client.transport.get(Endpoints.USER_INFO_WEB(id), { maxRetries: 0 }); }
			catch (_) { return []; }
		}
		const body = (res && res.data) || {};
		const u = body.user || (body.data && body.data.user);
		if (!u) return [];
		const versions = Array.isArray(u.hd_profile_pic_versions) ? u.hd_profile_pic_versions : [];
		return [
			u.hd_profile_pic_url_info && u.hd_profile_pic_url_info.url,
			...versions.slice().sort((a, b) => (b.width || 0) - (a.width || 0)).map(v => v && v.url),
			u.profile_pic_url_hd, u.profile_pic_url
		].filter(Boolean);
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

	// getThreadInfo is cached for 45s: drop the entry whenever membership changes (or the caller
	// needs a fresh member list) so "is X in the group now?" never reads stale data.
	api.invalidateThread = threadID => { try { threadCache.delete(str(threadID)); } catch (_) { /* ignore */ } };
	const addUsers = (userID, threadID, ...rest) => bridge(
		async () => { try { return await client.addParticipants(str(threadID), (Array.isArray(userID) ? userID : [userID]).map(str)); } finally { api.invalidateThread(threadID); } }, findCb(...rest));
	const removeUsers = (userID, threadID, ...rest) => bridge(
		async () => { try { return await client.removeParticipant(str(threadID), (Array.isArray(userID) ? userID : [userID]).map(str)); } finally { api.invalidateThread(threadID); } }, findCb(...rest));

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
	api.leaveThread = api.leaveGroup = (threadID, ...rest) => bridge(async () => { try { return await client.leaveThread(str(threadID)); } finally { api.invalidateThread(threadID); } }, findCb(...rest));
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
		const seen = new Set();
		const add = (type, url, extra = {}) => {
			if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
			const key = `${type}:${url}`;
			if (seen.has(key)) return;
			seen.add(key);
			out.push(Object.assign({ type, url, previewUrl: extra.previewUrl || url }, extra));
		};
		const addMedia = media => {
			if (!media || typeof media !== "object") return;
			const type0 = String(media.type || "").toLowerCase();
			const raw = media.raw || media;
			if (media.url) {
				const type = /video|clip/.test(type0) ? "video" : /audio|voice/.test(type0) ? "audio" : /image|photo|picture/.test(type0) ? "image" : type0 || "image";
				add(type, media.url, { previewUrl: media.previewUrl || media.thumbnailUrl || media.url,
					width: media.width || null, height: media.height || null, duration: media.duration || null });
			}
			const candidates = raw.image_versions2 && raw.image_versions2.candidates;
			if (Array.isArray(candidates) && candidates.length) {
				const best = candidates.slice().sort((a,b) => ((b.width||0)*(b.height||0))-((a.width||0)*(a.height||0)))[0];
				add("image", best && best.url, { previewUrl: best && best.url, width: best && best.width, height: best && best.height });
			}
			const videos = raw.video_versions || raw.videoVersions;
			if (Array.isArray(videos) && videos.length) {
				const best = videos.slice().sort((a,b) => ((b.width||0)*(b.height||0))-((a.width||0)*(a.height||0)))[0];
				add("video", best && best.url, { previewUrl: (candidates && candidates[0] && candidates[0].url) || null, duration: raw.video_duration || null });
			}
			const audio = raw.voice_media && raw.voice_media.media && raw.voice_media.media.audio;
			if (audio && audio.audio_src) add("audio", audio.audio_src, { duration: audio.duration || null });
			const voice = raw.voice_media && raw.voice_media.media;
			if (voice && voice.audio && voice.audio.audio_src) add("audio", voice.audio.audio_src, { duration: voice.audio.duration || null });
		};
		if (!msg || typeof msg !== "object") return out;
		if (msg.media) addMedia(msg.media);
		if (msg.share && (msg.share.url || msg.share.type)) out.push(Object.assign({ type: "share" }, msg.share, { ID: msg.id }));
		const raw = msg.raw || msg;
		// Instagram reply previews can contain the original media under several wrappers.
		const visit = (node, depth = 0) => {
			if (!node || typeof node !== "object" || depth > 5) return;
			if (Array.isArray(node)) { for (const item of node) visit(item, depth + 1); return; }
			if (node.media && typeof node.media === "object") addMedia(node.media);
			if (node.visual_media && node.visual_media.media) addMedia(node.visual_media.media);
			if (node.voice_media) addMedia({ type: "audio", raw: node });
			if (node.image_versions2 || node.video_versions) addMedia(node);
			if (Array.isArray(node.attachments)) visit(node.attachments, depth + 1);
			for (const key of ["replied_to_message", "reply_to_message", "reply_source_message", "quoted_message", "media_share", "carousel_media"]) {
				if (node[key]) visit(node[key], depth + 1);
			}
		};
		visit(raw);
		if (!out.length && msg.media) addMedia(msg.media);
		return out.map(a => Object.assign({ ID: msg.id }, a));
	}

	function mapMention(msg) {
		const out = {};
		for (const m of msg.mentions || []) if (m.userId) out[m.userId] = m.username ? `@${m.username}` : m.userId;
		return out;
	}

	const REPLY_KEY = /^(replied_to_message|reply_to_message|reply_source_message|replied_to|reply_to|reply|quoted_message|quote)$/i;
	const pickSender = rep => {
		if (!rep || typeof rep !== "object") return "";
		if (rep.is_sent_by_viewer === true) return str(client.userId);
		const c = rep.user_id || rep.sender_igid || rep.sender_id || rep.sender_fbid || rep.user_pk ||
			(rep.sender && (rep.sender.igid || rep.sender.pk || rep.sender.id)) || (rep.user && (rep.user.pk || rep.user.id));
		return c ? str(c) : "";
	};

	/** Look for a reply reference anywhere in a raw Instagram item (names differ between endpoints). */
	function deepReplyRef(raw, depth = 0) {
		if (!raw || typeof raw !== "object" || depth > 3) return null;
		for (const key of Object.keys(raw)) {
			const v = raw[key];
			if (REPLY_KEY.test(key) && v && typeof v === "object") {
				const id = v.item_id || v.message_id || v.id || v.client_context;
				if (id) return { id: str(id), sender: pickSender(v), text: v.text || v.text_body || (v.content && v.content.text_body) || "", raw: v };
			}
			if (/^(replied_to_message_id|reply_to_message_id|replied_to_item_id|reply_to_item_id|reply_item_id)$/i.test(key) && (typeof v === "string" || typeof v === "number") && v) {
				return { id: str(v), sender: str(raw.replied_to_user_id || raw.reply_to_user_id || ""), text: "" };
			}
		}
		for (const key of Object.keys(raw)) {
			const v = raw[key];
			if (v && typeof v === "object" && !Array.isArray(v)) { const r = deepReplyRef(v, depth + 1); if (r) return r; }
		}
		return null;
	}

	function refFromMessage(m) {
		if (!m) return null;
		if (m.replyTo && m.replyTo.id) return { id: str(m.replyTo.id), sender: m.replyTo.senderId ? str(m.replyTo.senderId) : pickSender(m.raw && (m.raw.replied_to_message || m.raw.reply_to_message)), text: m.replyTo.text || "", raw: m.raw && (m.raw.replied_to_message || m.raw.reply_to_message) || null, source: "payload" };
		const d = deepReplyRef(m.raw);
		return d ? Object.assign(d, { source: "raw" }) : null;
	}

	const prefix = (config && config.prefix) || "-";
	const looksLikeCommand = text => typeof text === "string" && text.trim().startsWith(prefix);

	/** Read the recent thread history once: learns senders and finds the reply info of one message. */
	async function readHistory(threadId, wantId) {
		const conv = await Promise.race([
			client.getConversation(str(threadId)),
			new Promise((_, rej) => setTimeout(() => rej(new Error("history lookup timed out")), 5000))
		]);
		let found = null;
		for (const m of (conv && conv.messages) || []) {
			const mid = str(m && (m.id || m.itemId));
			if (!mid) continue;
			const sid = m.senderId || m.userId || (m.sender && m.sender.id);
			if (sid) rememberMeta(mid, sid, m.text || "");
			if (wantId && mid === str(wantId)) found = m;
		}
		return found;
	}

	/**
	 * Find what a message replies to. The realtime poll often delivers items WITHOUT the reply
	 * reference, so for command-looking messages we re-read the thread (one request) to get it.
	 */
	let lastPlainLookup = 0;
	async function findReply(msg) {
		let ref = refFromMessage(msg);
		// A plain "swipe-reply" to the bot (no prefix, e.g. answering Shihab) also needs its reply info:
		// look it up when the bot spoke in this thread in the last 10 minutes (one request, max one per 1.5s).
		const botSpokeRecently = Date.now() - (lastBotSendAt.get(str(msg.threadId)) || 0) < 10 * 60 * 1000;
		const plainLookup = !ref && !msg.isSelf && !looksLikeCommand(msg.text) && botSpokeRecently && !!(msg.text && String(msg.text).trim()) && Date.now() - lastPlainLookup > 1500;
		if (plainLookup) lastPlainLookup = Date.now();
		if (!ref && !msg.isSelf && (looksLikeCommand(msg.text) || plainLookup)) {
			for (let attempt = 0; attempt < (plainLookup ? 1 : 2) && !ref; attempt++) {
				try {
					if (attempt) await sleep(900);
					ref = refFromMessage(await readHistory(msg.threadId, msg.id));
					if (ref) ref.source = "history";
				}
				catch (_) { break; }
			}
		}
		return ref;
	}

	async function resolveReplySender(msg, ref) {
		const rid = str(ref.id);
		let sender = ref.sender || "";
		let text = ref.text || "";
		let source = ref.source || "payload";
		const meta = metaOf.get(rid);
		if (!sender && meta && meta.senderId) { sender = meta.senderId; source += "+cache"; }
		if (!text && meta && meta.text) text = meta.text;
		if (!sender) {
			try {
				await readHistory(msg.threadId, null);
				const found = metaOf.get(rid);
				if (found) { if (found.senderId) { sender = found.senderId; source += "+history"; } if (!text && found.text) text = found.text; }
			}
			catch (_) { /* keep what we have */ }
		}
		return { id: rid, sender: sender || "", text, raw: ref.raw || null, source: sender ? source : source + " (sender unknown)" };
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
		event.replySource = replied ? replied.source : "none";
		if (replied && replied.id) {
			event.repliedToMessage = {
				messageID: replied.id,
				senderID: replied.sender,
				body: replied.text,
				attachments: Array.isArray(replied.attachments) ? replied.attachments : [],
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

	const liveThreads = new Set();
	const BOOT_AT = Date.now();
	client.on(Events.MESSAGE, async msg => {
		if (!msg) return;
		// Never act on chat history: the first message we see in a thread (e.g. right after being added
		// to a group chat) must be fresh, and nothing from before the bot started is processed.
		const tid = str(msg.threadId);
		if (!liveThreads.has(tid)) {
			const ts = Number(msg.timestamp) || 0;
			if (ts && (ts < BOOT_AT - 3000 || ts < Date.now() - 15000)) { remember(msg.id, msg.threadId); return; }
			liveThreads.add(tid);
		}
		remember(msg.id, msg.threadId);
		rememberMeta(msg.id, msg.isSelf ? client.userId : msg.senderId, msg.text || "");
		rememberAtts(msg.id, mapAttachments(msg));
		if (msg.isSelf) {
			// Our own sends come back through polling; give send() a moment to register the id,
			// then only deliver messages typed from another device (and only with selfListen).
			await sleep(1500);
			if (!selfListen || sentByBot.has(str(msg.id))) return;
		}
		let replied = null;
		try {
			const ref = await findReply(msg);
			if (ref) replied = await resolveReplySender(msg, ref);
		}
		catch (e) { log.warn("REPLY", `could not resolve reply: ${e.message}`); }
		if (replied && replied.id) {
			let atts = attsOf.get(str(replied.id));
			// Some Instagram reply payloads embed the quoted media itself; extract it
			// before falling back to thread history (important for older/group media).
			if (!atts || !atts.length) {
				const embedded = replied.raw ? mapAttachments({ raw: replied.raw }) : [];
				if (embedded.length) atts = embedded;
			}
			if ((!atts || !atts.length) && (looksLikeCommand(msg.text) || replied.raw)) {
				try {
					const m = await readHistory(msg.threadId, replied.id);
					if (m) { const historyAtts = mapAttachments(m); if (historyAtts.length) atts = historyAtts; rememberAtts(replied.id, atts || []); }
				} catch (_) { /* history may not expose expired media */ }
			}
			replied.attachments = atts || [];
		}
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
