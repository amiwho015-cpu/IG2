/**
 * File Name: echo.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

const t = require("../src/languages").text;

module.exports = {
	config: {
		name: "echo",
		aliases: ["say", "bolo"],
		author: "Neoaz 🐊",
		category: "Users Cmd",
		cooldown: 2,
		role: 0,
		description: { en: "Repeat whatever you type after the command" },
		usage: { en: "{p}echo <text>" }
	},

	onStart: async function ({ message, args, config }) {
		if (!args.length)
			return message.reply(t(config.language, "echoEmpty"));
		return message.reply(args.join(" "));
	}
};
