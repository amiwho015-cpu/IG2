/**
 * File Name: unsend.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

module.exports = {
	config: {
		name: "unsend",
		aliases: ["uns", "delete", "del", "unsent", "r"],
		author: "Neoaz 🐊",
		category: "Users Cmd",
		cooldown: 1,
		role: 0,
		description: { en: "Unsend a message: reply to any message and the bot removes it" },
		usage: { en: "Reply to a message with {p}unsend" }
	},

	onStart: async function ({ message, event, api }) {
		const replied = event.messageReply;
		if (!replied || !replied.messageID) return;

		const threadID = event.threadID;
		const target = replied.messageID;

		try {
			await new Promise((resolve, reject) => {
				api.unsendMessage(target, (error, result) => error ? reject(error) : resolve(result));
			});
		}
		catch (_) { }
	}
};
