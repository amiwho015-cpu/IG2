"use strict";

/**
 * onReaction — runs for reaction events.
 * Removes a bot message when anyone reacts to it with 😡 😠 👎 🗑️ (works in every GC and DM).
 * Instagram only lets an account unsend its OWN messages, so reacting to someone else's
 * message is ignored.
 */

const log = require("../src/logger");

// Strip variation selectors / skin tones so "👎🏽" and "🗑️" match the plain emoji.
const normalize = emoji => String(emoji || "")
	.replace(/[\uFE0E\uFE0F]/g, "")
	.replace(/\u{1F3FB}|\u{1F3FC}|\u{1F3FD}|\u{1F3FE}|\u{1F3FF}/gu, "");
const REMOVE = new Set(["😡", "😠", "👎", "🗑"]);

module.exports = {
	config: {
		name: "onReaction",
		category: "system",
		eventType: "message_reaction"
	},

	onEvent: async function ({ api, event }) {
		if (!REMOVE.has(normalize(event.reaction))) return;

		const senderID = String(event.senderID || event.userID || "");
		const botID = String((global.GoatBot && global.GoatBot.botID) || "");
		if (botID && senderID === botID) return; // the bot's own reaction

		const messageID = event.messageID;
		const threadID = event.threadID;
		if (!messageID) return;

		// One fast attempt straight at Instagram (no multi-shape retries with sleeps).
		const unsend = typeof api.__rawUnsend === "function" ? api.__rawUnsend : api.unsendMessage.bind(api);
		try {
			await new Promise((resolve, reject) =>
				unsend(messageID, threadID, (error, result) => error ? reject(error) : resolve(result)));
			log.info("REACTION", `${senderID} removed message ${messageID} in ${threadID}`);
		}
		catch (error) {
			// Not the bot's message (or already gone): quietly ignore.
			log.warn("REACTION", `Could not remove ${messageID}: ${(error && error.message) || error}`);
		}
	}
};
