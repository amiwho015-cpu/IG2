"use strict";

module.exports = {
	config: {
		name: "antiout",
		version: "2.0",
		author: "CRX Shihab",
		countDown: 5,
		role: 1,
		shortDescription: "Enable or disable antiout",
		longDescription: "When on, a member who leaves the group by themselves is added back automatically.",
		category: "box chat",
		guide: "{pn} [on | off]"
	},

	onStart: async function ({ event, args, message, threadsData }) {
		const choice = String(args[0] || "").toLowerCase();
		const current = await threadsData.get(event.threadID, "settings.antiout", false);
		if (!["on", "off"].includes(choice))
			return message.reply(`Antiout is currently ${current ? "ON" : "OFF"}.\nUse: antiout on | antiout off`);
		await threadsData.set(event.threadID, choice === "on", "settings.antiout");
		return message.reply(`✅ Antiout has been ${choice === "on" ? "enabled" : "disabled"}.`);
	}
};
