"use strict";

const { errText } = require("../src/igActions");

module.exports = {
	config: {
		name: "out",
		aliases: ["leave", "outgroup"],
		version: "3.0",
		author: "CRX Shihab",
		countDown: 5,
		role: 1,
		shortDescription: "Bot will leave group",
		longDescription: "Bot says goodbye and leaves this group, or the group with the given thread id (bot admin only).",
		category: "BOX CHAT",
		guide: {
			en: "{pn} [tid,blank]"
		}
	},

	onStart: async function ({ api, event, args, message, role }) {
		const raw = args.join(" ").trim();
		// Thread ids are longer than 2^53: keep them as strings (parseInt would
		// round them and leave the wrong / a non-existent group).
		const id = raw ? raw.replace(/[^\d]/g, "") : String(event.threadID);
		if (raw && !/^\d{5,}$/.test(id)) return message.reply("⚠️ Give a valid group thread id (TID) or use the command inside the group.");

		const other = String(id) !== String(event.threadID);
		if (other && role < 2) return message.reply("⚠️ Only bot admins can make the bot leave another group.");

		try { await api.sendMessage("𝐥𝐞𝐟𝐭 𝐟𝐫𝐨𝐦 𝐭𝐡𝐞 𝐠𝐫𝐨𝐮𝐩..!🦆💨", id); }
		catch (_) { /* goodbye is optional, leaving is not */ }

		try {
			await api.leaveGroup(id);
			if (other) return message.reply(`✅ Left group ${id}.`);
		}
		catch (error) {
			return message.reply(`❌ Could not leave${other ? " " + id : ""}: ${errText(error)}`);
		}
	}
};
