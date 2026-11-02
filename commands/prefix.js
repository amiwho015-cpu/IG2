/**
 * File Name: prefix.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

const t = require("../src/languages").text;
const { saveConfig } = require("../src/config");

// Bot admins are role 2, group admins role 1, everyone else role 0. Changing the
// prefix is a bot-admin action; everyone may run the command to READ it, which
// is why `role` is 0 and `noPrefixRole` is 0 (a normal user typing `prefix`
// without the prefix character is allowed through).
const ROLE_ADMIN_BOT = 2;

module.exports = {
	config: {
		name: "prefix",
		aliases: ["setprefix"],
		author: "Neoaz 🐊",
		category: "Admin Cmds",
		cooldown: 2,
		role: 0,
		noPrefix: true,
		noPrefixRole: 0,
		description: { en: "Show the command prefix (bot admins can change it)" },
		usage: { en: "{p}prefix [newPrefix] — or just `prefix` / `prefix !`" }
	},

	onStart: async function ({ message, args, config, role }) {
		const lang = config.language;

		// No argument: anyone may see the current prefix.
		if (!args.length)
			return message.reply(t(lang, "prefixCurrent", config.prefix));

		// A new prefix may only be set by a bot admin. A normal user who types
		// `prefix <something>` gets the current value, not a silent ignore, so
		// the command never looks broken.
		if (Number(role) < ROLE_ADMIN_BOT)
			return message.reply(t(lang, "prefixOnlyAdmin", config.prefix));

		const next = args[0];
		if (next.length > 3)
			return message.reply("The prefix must be 1–3 characters.");
		config.prefix = next;
		saveConfig(config);
		return message.reply(t(lang, "prefixChanged", next));
	}
};
