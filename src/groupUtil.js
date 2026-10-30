"use strict";

/**
 * Helpers shared by the group-management commands (listbox, pending, ...).
 * Instagram's thread list shape is not guaranteed, so every field is read
 * defensively and the bot's own thread database is used as a fallback.
 */

function normalise(t) {
	if (!t || typeof t !== "object") return null;
	const threadID = String(t.threadID || t.thread_id || t.id || "");
	if (!threadID) return null;
	const participants = t.participantIDs || t.userIDs || t.participants || [];
	const isGroup = t.isGroup === true || (t.isGroup == null && Array.isArray(participants) && participants.length > 2);
	return {
		threadID,
		name: t.threadName || t.name || t.thread_title || "",
		isGroup,
		members: Array.isArray(participants) ? participants.length : (t.memberCount || 0)
	};
}

async function fetchFolder(api, folder, limit = 200) {
	const list = await api.getThreadList(limit, null, [folder]);
	return (Array.isArray(list) ? list : []).map(normalise).filter(Boolean);
}

/** Groups the bot is in: server inbox first, local thread database as fallback. */
async function listGroups(api, threadsData) {
	let groups = [];
	try { groups = (await fetchFolder(api, "INBOX", 500)).filter(t => t.isGroup); }
	catch (_) { /* fall back below */ }
	if (!groups.length && threadsData) {
		try {
			const all = await threadsData.getAll();
			groups = all.filter(r => r && r.isGroup)
				.map(r => ({ threadID: String(r.threadID), name: r.name || "", isGroup: true, members: (r.members || []).length }));
		}
		catch (_) { /* nothing more to try */ }
	}
	// Stable order so a serial number keeps pointing at the same group between commands.
	return groups.sort((a, b) => String(a.threadID).localeCompare(String(b.threadID), "en", { numeric: true }));
}

/** Groups already approved/refused from `pending` this session (Instagram can keep listing them for a while). */
const handled = new Set();
function markHandled(threadID) { handled.add(String(threadID)); }

/**
 * Group message requests that are waiting for the bot. Instagram's request
 * folders can echo back groups the bot is already in, so anything that is in
 * the normal inbox (or was just approved/refused) is removed here.
 */
async function listPending(api) {
	const inbox = new Set();
	try { for (const t of await fetchFolder(api, "INBOX", 500)) inbox.add(t.threadID); }
	catch (_) { /* cannot tell the inbox apart: show the request list as is */ }

	const out = [];
	const seen = new Set();
	let lastError = null;
	let reached = false;
	for (const folder of ["PENDING", "OTHER"]) {
		try {
			for (const t of await fetchFolder(api, folder, 100)) {
				reached = true;
				if (!t.isGroup || seen.has(t.threadID)) continue;
				seen.add(t.threadID);
				if (inbox.has(t.threadID) || handled.has(t.threadID)) continue;
				out.push(t);
			}
		}
		catch (error) { lastError = error; }
	}
	if (!reached && lastError) throw lastError;
	return out;
}

// Add / follow / membership logic lives in igActions so every build's method
// names are tried (see that file).
const { joinUser } = require("./igActions");

module.exports = { normalise, listGroups, listPending, markHandled, joinUser };
