"use strict";

/**
 * Shared state for the welcome message:
 *  - recently(): the same member is never greeted twice within a few minutes, even when
 *    Instagram sends the join event twice or the scan below sees them too.
 *  - members: the last known member list of each group, for events/onJoinScan.js.
 */

const TTL = 3 * 60 * 1000;
const greeted = new Map();      // `${threadID}:${key}` -> time
const members = new Map();      // threadID -> { ids:Set, at:number, checking:boolean }

function prune(now) {
	for (const [key, at] of greeted) if (now - at > TTL) greeted.delete(key);
}

/** True when this member was already greeted in this thread a moment ago (and marks them as greeted if not). */
function recently(threadID, ...keys) {
	const now = Date.now();
	prune(now);
	const ks = keys.filter(Boolean).map(k => `${threadID}:${String(k).replace(/^@/, "").toLowerCase()}`);
	if (ks.some(k => greeted.has(k))) return true;
	for (const k of ks) greeted.set(k, now);
	return false;
}

function forget(threadID, ...keys) {
	for (const k of keys.filter(Boolean)) greeted.delete(`${threadID}:${String(k).replace(/^@/, "").toLowerCase()}`);
}

module.exports = { recently, forget, members };
