"use strict";

/**
 * onJoinScan — safety net for the welcome message.
 *
 * Instagram does not always push a "member added" event to the bot. So that new members
 * are still greeted, this watches the member list of every group the bot sees messages
 * in (one lookup per group per 90 s at most) and hands anyone new to the normal welcome
 * (events/onJoin.js). A member who was already greeted by a real join event is skipped
 * (src/welcomeState.js), so nobody gets two welcomes.
 *
 * The first lookup of a group after a start only records who is there (no welcomes).
 * Turn off with config.json -> welcome.fallbackScan = false.
 *
 * Author: Shihab
 */

const state = require("../src/welcomeState");
const { participants } = require("../src/igActions");
const log = require("../src/logger");

const EVERY_MS = 90 * 1000;
const MAX_NEW = 8; // more than this at once = a bulk import, not people to greet one by one

module.exports = {
	config: {
		name: "onJoinScan",
		category: "system",
		eventType: ["message", "message_reply"],
		description: { en: "Welcome members that Instagram did not announce with a join event" }
	},

	onEvent: async function ({ api, event, message, config, threadsData }) {
		const settings = config.welcome || {};
		if (settings.enable === false || settings.fallbackScan === false) return;
		if (event.isGroup !== true) return;

		const threadID = String(event.threadID);
		let rec = state.members.get(threadID);
		if (!rec) { rec = { ids: null, at: 0, checking: false }; state.members.set(threadID, rec); }
		const now = Date.now();
		if (rec.checking || now - rec.at < EVERY_MS) return;
		rec.checking = true;
		rec.at = now;

		try {
			const ids = await participants(api, threadID);
			if (!ids.length) return;
			const before = rec.ids;
			rec.ids = new Set(ids);
			if (!before) return;

			const fresh = ids.filter(id => !before.has(id));
			if (!fresh.length || fresh.length > MAX_NEW) return;
			log.info("JOIN", `scan found ${fresh.length} new member(s) in ${threadID}`);
			await require("./onJoin").onEvent({
				api, message, config, threadsData,
				event: { type: "join", threadID, userIDs: fresh, isGroup: true, synthetic: true }
			});
		}
		catch (error) {
			log.warn("JOIN", `member scan failed: ${error.message}`);
		}
		finally {
			rec.checking = false;
		}
	}
};
