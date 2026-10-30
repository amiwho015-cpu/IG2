"use strict";

/**
 * onAntiOut — add a member back when they leave a group by themselves.
 * Turned on per group with the `antiout on` command.
 *
 * Instagram's membership event has no Facebook-style `leftParticipantFbId`:
 * the affected members arrive as numeric `userIDs` and/or @handles in
 * `usernames`, and `senderID` is the ACTOR. A member who left on their own is
 * their own actor; someone removed by a group admin is not re-added.
 */

const log = require("../src/logger");
const ig = require("../src/igActions");

module.exports = {
	config: {
		name: "onAntiOut",
		category: "system",
		eventType: "leave",
		description: { en: "Re-add members who leave a group (antiout)" }
	},

	onEvent: async function ({ api, event, message, threadsData }) {
		const threadID = String(event.threadID);
		const thread = threadsData.get(threadID);
		if (!thread || !thread.settings || thread.settings.antiout !== true) return;

		const botID = String(api.getCurrentUserID());
		const actor = event.senderID != null ? String(event.senderID) : null;

		const ids = new Set((event.userIDs && event.userIDs.length ? event.userIDs : (event.participantID ? [event.participantID] : [])).map(String));
		if (!ids.size && Array.isArray(event.usernames) && event.usernames.length) {
			const { resolveUserTarget } = require("../src/utils");
			for (const name of event.usernames.slice(0, 5)) {
				try {
					const t = await resolveUserTarget([String(name).replace(/^@/, "")], null, api);
					if (t && t.id) ids.add(String(t.id));
				}
				catch (_) { /* cannot resolve this handle */ }
			}
		}

		for (const id of ids) {
			if (id === botID) continue;
			// Known actor different from the member = removed by someone: leave it.
			if (actor && actor !== id && actor !== "undefined") continue;
			try {
				const res = await ig.joinUser(api, id, threadID);
				if (!res.already) log.info("ANTIOUT", `added ${id} back to ${threadID}`);
			}
			catch (error) {
				log.warn("ANTIOUT", `could not add ${id} back to ${threadID}: ${ig.errText(error)}`);
				try { await message.send("⚠️ Antiout: I could not add that member back. They may need to follow the bot first."); }
				catch (_) { /* nothing more to do */ }
			}
		}
	}
};
