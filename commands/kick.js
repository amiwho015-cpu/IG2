"use strict";

const { collectTargets, errText } = require("../src/igActions");

module.exports = {
	config: {
		name: "kick",
		aliases: ["kik"],
		version: "3.0",
		author: "CRX Shihab",
		countDown: 5,
		role: 1,
		shortDescription: "Kick members from group",
		longDescription: "Remove members by tagging, replying, or giving a username / uid.",
		category: "box chat",
		guide: "{pn} @tag | reply | <username|uid>"
	},

	onStart: async function ({ api, event, args, message }) {
		const { threadID } = event;
		const botID = String(api.getCurrentUserID());

		const hasInput = (event.messageReply && event.messageReply.senderID)
			|| (event.mentions && Object.keys(event.mentions).length) || args.length;
		if (!hasInput) return message.reply("❌ Tag the user, reply to their message, or give a username / uid to kick.");

		// Group admins are listed by getThreadInfo. Only refuse when the list is
		// known and does not contain the bot; an empty list means "unknown", so
		// try the kick and let Instagram answer.
		try {
			const info = await api.getThreadInfo(threadID);
			const admins = (info.adminIDs || []).map(a => String(typeof a === "object" ? a.id : a));
			if (admins.length && !admins.includes(botID))
				return message.reply("⚠️ Bot is not an admin in this group. Please promote the bot to admin first!");
		}
		catch (_) { /* cannot read admins: try anyway */ }

		const targets = await collectTargets(event, args, api, 10);
		const kicked = [];
		const failed = [];
		for (const t of targets) {
			if (t.error) { failed.push(`${t.label} (not found${t.rateLimited ? ", Instagram is throttling lookups" : ""})`); continue; }
			if (t.id === botID) continue;
			try { await api.removeUserFromGroup(t.id, threadID); kicked.push(t.label); }
			catch (error) { failed.push(`${t.label} (${errText(error)})`); }
		}

		if (!kicked.length && !failed.length) return message.reply("❌ I can't kick myself. Use the out command to make me leave.");
		let msg = "";
		if (kicked.length) msg += `✅ Kicked ${kicked.length} member(s): ${kicked.join(", ")}`;
		if (failed.length) msg += `${msg ? "\n" : ""}❌ Failed: ${failed.join(", ")}`;
		return message.reply(msg);
	}
};
