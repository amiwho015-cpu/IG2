"use strict";

/**
 * onReaction — runs for reaction events.
 * Removes a bot message when someone reacts to it with 😡 😠 👎 🗑️ (works in every GC).
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const log = require("../src/logger");

module.exports = {
	config: {
		name: "onReaction",
		category: "system",
		eventType: "message_reaction"
	},

	onEvent: async function ({ event, message, config }) {
		// Any member of any chat (GC or DM) can remove a BOT message by reacting with an
		// angry / thumbs-down / trash emoji. Instagram only lets an account unsend its own
		// messages, so reacting to someone else's message is simply ignored.
		// Compare without variation selectors / skin tones, so "👎🏽" or "🗑️" vs "🗑" all match.
		const clean = e => String(e || "").replace(/[\uFE0E\uFE0F\u200D]|\uD83C[\uDFFB-\uDFFF]/g, "");
		log.info("REACTION", `${event.senderID || event.userID} reacted ${event.reaction} on ${event.messageID}`);
		const REMOVE = ["😡", "😠", "🤬", "👎", "🗑"].map(clean);
		if (!REMOVE.includes(clean(event.reaction))) return;

		const senderID = String(event.senderID || event.userID || "");
		const botID = String((global.GoatBot && global.GoatBot.botID) || "");
		if (botID && senderID === botID) return; // the bot's own reaction

		// Instagram sometimes needs a moment before a fresh message can be removed: try twice.
		for (let attempt = 1; attempt <= 2; attempt++) {
			try {
				await message.unsend(event.messageID);
				log.info("REACTION", `${senderID} removed message ${event.messageID} in ${event.threadID}`);
				return;
			}
			catch (error) {
				const text = String((error && (error.message || error.error)) || error);
				// Not the bot's own message: Instagram never allows removing it, so do not retry.
				if (/not.*(your|own|sender)|permission|only.*own/i.test(text) || attempt === 2) {
					log.warn("REACTION", `Could not remove ${event.messageID}: ${text.slice(0, 160)}`);
					return;
				}
				await new Promise(r => setTimeout(r, 2500));
			}
		}
	}
};
