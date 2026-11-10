"use strict";

/**
 * Welcome picture for a new member, from the toshiro canvas API
 * (/api/canvas/welcard or /api/canvas/welcome).
 *
 *   make({ api, threadID, uid, kind }) -> { buffer, ext, file, name } | null   (null when the API fails)
 */

const { canvas } = require("./canvasApi");
const { invoke } = require("./igActions");
const { profileOf, avatarUrl, drawableName, writeTemp } = require("./cardUtil");

async function groupFacts(api, threadID, threadsData) {
	let name = null, count = null;
	try {
		const rec = threadsData && threadsData.get ? threadsData.get(threadID) : null;
		name = rec && rec.name;
	}
	catch (_) { /* optional */ }
	try {
		const info = await invoke(api, "getThreadInfo", [String(threadID)]);
		if (info) {
			name = info.name || info.threadName || name;
			const list = info.participantIDs || info.userIDs;
			if (Array.isArray(list)) count = list.length;
		}
	}
	catch (_) { /* optional */ }
	const clean = String(name || "").replace(/[^\p{Script=Latin}\p{N}\s.'_&-]/gu, "").replace(/\s+/g, " ").trim();
	return { name: clean.length >= 2 ? clean.slice(0, 30) : "our group", count };
}

function make(opts) {
	const limit = (opts.timeout || 25000) + 8000;
	return Promise.race([
		makeCard(opts),
		new Promise(resolve => setTimeout(() => resolve(null), limit).unref())
	]);
}

async function makeCard({ api, threadID, uid, kind = "welcard", threadsData, timeout = 25000 }) {
	if (!uid) return null;
	try {
		const profile = await profileOf(api, uid);
		const [avatar, group] = await Promise.all([avatarUrl(api, uid, profile), groupFacts(api, threadID, threadsData)]);
		const name = drawableName(profile, uid);
		const img = await canvas(kind, {
			avatar,
			name,
			group: group.name,
			count: group.count != null ? String(group.count) : null
		}, { timeout, attempts: 5 });
		return { buffer: img.buffer, ext: img.ext, file: writeTemp(img.buffer, img.ext, "welcome"), name };
	}
	catch (error) {
		require("./logger").warn("WELCOME", `card failed: ${error.message}`);
		return null;
	}
}

module.exports = { make, groupFacts };
