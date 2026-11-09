"use strict";

const fs = require("fs");

module.exports = {
	config: {
		name: "onlyadmin",
		aliases: ["adminonly", "oa"],
		version: "1.0",
		author: "Shihab",
		countDown: 3,
		role: 2,
		category: "owner",
		description: { en: "Turn admin-only mode ON/OFF for every help2 command" },
		guide: {
			en: "{pn} on → help2 commands usable by bot admins only\n" +
				"{pn} off → everyone can use them again\n" +
				"{pn} → show status\n" +
				"(anime / image / media commands and help stay open to everyone)"
		}
	},

	onStart: async function ({ args, message, config }) {
		const live = (global.GoatBot && global.GoatBot.config) || config;
		const sub = String(args[0] || "").toLowerCase();
		const prefix = (config && config.prefix) || "-";

		if (sub !== "on" && sub !== "off")
			return message.reply(`🔐 Only-admin mode (help2 commands): ${live.onlyAdminMore === true ? "ON" : "OFF"}\n\n${prefix}onlyadmin on → admins only\n${prefix}onlyadmin off → everyone`);

		live.onlyAdminMore = sub === "on";
		try { fs.writeFileSync(global.client.dirConfig, JSON.stringify(live, null, 2)); }
		catch (e) { return message.reply(`⚠️ Mode changed but could not be saved to config.json, it resets on restart. (${e.message})`); }

		return message.reply(sub === "on"
			? "🔒 Only-admin mode: ON\nEvery help2 command now works for bot admins only. (anime / image / media + help stay open)"
			: "🔓 Only-admin mode: OFF\nEveryone can use the commands again.");
	}
};
