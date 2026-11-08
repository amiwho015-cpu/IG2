"use strict";

/**
 * Instagram group / follow actions that work on every ig-chat-api build.
 *
 * Insta-Bot (GoatBot IG) calls api.addUserToGroup / removeUserFromGroup /
 * deleteThread / follow / unfollow directly. Other builds (and the hosted
 * server bridge) only expose addUserToThread / removeUserFromThread, and some
 * have no follow/leave method under the name this bot used to call. So every
 * action here tries the known method names one after another and only gives up
 * when none of them exists.
 *
 * Every helper takes the RAW api (promise or node-callback style, both work).
 */

const MISSING = /is not a function|unknown method|not supported|unsupported|no such method|not implemented|not available|method not allowed|not allowed method/i;

const errText = e => (e && (e.error || e.message)) || String(e);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Call api[name](...args) and resolve with its result whether the build answers
 * through a node callback, a returned promise, or both (first answer wins).
 */
function invoke(api, name, args = []) {
	return new Promise((resolve, reject) => {
		let done = false;
		const timer = setTimeout(() => finish(new Error(`${name} timed out`)), 45000);
		if (timer.unref) timer.unref();
		const finish = (error, result) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			error ? reject(error) : resolve(result);
		};
		let ret;
		try { ret = api[name](...args, (error, result) => finish(error || null, result)); }
		catch (error) { return finish(error); }
		if (ret && typeof ret.then === "function") ret.then(r => finish(null, r), e => finish(e));
	});
}

/**
 * Try each [methodName, args] strategy in order. A strategy whose method does
 * not exist (or reports "unknown method") is skipped; any other failure is a
 * real answer from Instagram and is thrown unless `keepTrying` is set.
 */
async function firstThatWorks(api, strategies, { keepTrying = false, label = "action" } = {}) {
	let lastError = null;
	for (const [name, args] of strategies) {
		if (!api || typeof api[name] !== "function") continue;
		try { return await invoke(api, name, args); }
		catch (error) {
			lastError = error;
			if (!keepTrying && !MISSING.test(errText(error))) throw error;
		}
	}
	if (lastError) throw lastError;
	throw new Error(`"${label}" is not available in this ig-chat-api build.`);
}

const selfID = api => {
	try { return api.getCurrentUserID && String(api.getCurrentUserID() || ""); }
	catch (_) { return ""; }
};

function addUser(api, uid, tid) {
	uid = String(uid); tid = String(tid);
	return firstThatWorks(api, [["addUserToThread", [uid, tid]], ["addUserToGroup", [uid, tid]]], { label: "addUserToGroup" });
}

function removeUser(api, uid, tid) {
	uid = String(uid); tid = String(tid);
	return firstThatWorks(api, [["removeUserFromThread", [uid, tid]], ["removeUserFromGroup", [uid, tid]]], { label: "removeUserFromGroup" });
}

function follow(api, uid) {
	uid = String(uid);
	return firstThatWorks(api, [["follow", [uid]], ["followUser", [uid]]], { label: "follow" });
}

function unfollow(api, uid) {
	uid = String(uid);
	return firstThatWorks(api, [["unfollow", [uid]], ["unfollowUser", [uid]]], { label: "unfollow" });
}

/**
 * Make the bot leave a group. Insta-Bot's `leave` command uses deleteThread;
 * builds without it fall back to removing the bot's own account.
 */
function leaveGroup(api, tid) {
	tid = String(tid);
	const me = selfID(api);
	const strategies = [
		["deleteThread", [tid]],
		["leaveThread", [tid]],
		["leaveGroup", [tid]]
	];
	if (me) strategies.push(["removeUserFromThread", [me, tid]], ["removeUserFromGroup", [me, tid]]);
	return firstThatWorks(api, strategies, { keepTrying: true, label: "leave group" });
}

/** Participant ids of a thread; [] when Instagram will not say. */
async function participants(api, tid) {
	try {
		const info = await invoke(api, "getThreadInfo", [String(tid)]);
		return ((info && (info.participantIDs || info.userIDs)) || []).map(String);
	}
	catch (_) { return []; }
}

/**
 * Add a user to a group. Instagram refuses to add an account the bot does not
 * follow, so on failure the bot follows that account (ignoring "already
 * following" style errors) and retries once.
 * Resolves { already } / { ok, followed } or throws the last error.
 */
async function joinUser(api, uid, tid) {
	uid = String(uid);
	if ((await participants(api, tid)).includes(uid)) return { already: true };
	let lastError;
	try { await addUser(api, uid, tid); return { ok: true }; }
	catch (error) { lastError = error; }
	let followed = false;
	try { await follow(api, uid); followed = true; }
	catch (_) { /* may already be following, or private: retry the add anyway */ }
	await sleep(1500);
	try { await addUser(api, uid, tid); return { ok: true, followed }; }
	catch (error) { lastError = error || lastError; }
	throw new Error(errText(lastError));
}

/**
 * Who a command targets, in priority order: the replied-to message's sender,
 * @tags (event.mentions is filled from "@handle" text), then each argument
 * (numeric id, @username, or profile link).
 * Returns [{ id, label }] or { error, label, rateLimited } entries.
 */
async function collectTargets(event, args, api, max = 5) {
	const { resolveUserTarget } = require("./utils");
	const out = [];
	if (event && event.messageReply && event.messageReply.senderID) {
		out.push({ id: String(event.messageReply.senderID), label: String(event.messageReply.senderID) });
		return out;
	}
	if (event && event.mentions && Object.keys(event.mentions).length) {
		for (const id of Object.keys(event.mentions).slice(0, max))
			out.push({ id: String(id), label: String(event.mentions[id] || "").replace(/^@/, "") || String(id) });
		return out;
	}
	for (const arg of (args || []).slice(0, max)) {
		const t = await resolveUserTarget([arg], null, api).catch(() => ({ id: null }));
		out.push(t && t.id ? { id: String(t.id), label: arg } : { error: true, label: arg, rateLimited: !!(t && t.rateLimited) });
	}
	return out;
}

module.exports = {
	invoke, firstThatWorks, errText, sleep, selfID,
	addUser, removeUser, follow, unfollow, leaveGroup, participants, joinUser, collectTargets
};
