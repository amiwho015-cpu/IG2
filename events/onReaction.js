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
		const REMOVE = ["😡", "😠", "👎", "🗑️", "🗑"];
		if (!REMOVE.includes(event.reaction)) return;

		const senderID = String(event.senderID || event.userID || "");
		const botID = String((global.GoatBot && global.GoatBot.botID) || "");
		if (botID && senderID === botID) return; // the bot's own reaction

		try {
			await message.unsend(event.messageID);
			log.info("REACTION", `${senderID} removed message ${event.messageID} in ${event.threadID}`);
		}
		catch (error) {
			log.warn("REACTION", `Could not remove ${event.messageID}: ${error.message}`);
		}
	}
};
