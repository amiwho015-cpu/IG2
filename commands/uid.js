/**
 * File Name: uid.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

const { resolveUserTarget } = require("../src/utils");

module.exports = {
	config: {
		name: "uid",
		aliases: ["id"],
		author: "Neoaz 🐊",
		category: "Users Cmd",
		cooldown: 2,
		role: 0,
		description: { en: "Return an Instagram numeric user id" },
		usage: { en: "{p}uid [userID | @handle | username | profile URL] — or reply to a message" }
	},

	onStart: async function ({ message, args, event, api }) {
		// Accepts a numeric id, @handle, bare username, profile URL, or a reply.
		const target = await resolveUserTarget(args, event, api);
		if (target.id) return message.reply(String(target.id));
		if (target.rateLimited) return message.reply("Instagram is rate-limiting lookups right now. Please try again in a few minutes.");
		if (target.username) return message.reply(`Could not find @${target.username}.`);
		return message.reply(String(event.senderID));
	}
};
