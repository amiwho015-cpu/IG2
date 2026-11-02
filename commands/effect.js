/**
 * File Name: effect.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

module.exports = {
	config: {
		name: "effect",
		aliases: ["fx"],
		author: "Neoaz 🐊",
		category: "Users Cmd",
		cooldown: 3,
		role: 0,
		description: { en: "Send text with an Instagram power-up effect" },
		usage: { en: "{p}effect <love|gift|celebration|fire> <text>" }
	},

	onStart: async function ({ message, args }) {
		const effects = ["love", "gift", "celebration", "fire"];
		const effect = (args.shift() || "").toLowerCase();
		if (!effects.includes(effect))
			return message.reply(`Pick an effect: ${effects.join(", ")}.\nExample: effect fire Hello!`);
		const text = args.join(" ") || "✨";
		try {
			await message.effect(text, effect);
		}
		catch (error) {
			return message.reply(String(error.message || error));
		}
	}
};
