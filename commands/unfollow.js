"use strict";

const { collectTargets, errText } = require("../src/igActions");

module.exports = {
	config: {
		name: "unfollow",
		aliases: ["unfl"],
		version: "1.2",
		author: "Neoaz 🐊",
		countDown: 5,
		role: 2,
		description: { en: "Unfollow Instagram users" },
		category: "user",
		guide: {
			en: "   {pn} @tag: unfollow tagged users"
				+ "\n   {pn} <username|@username|profile link|uid>: unfollow that account"
				+ "\n   Reply to a message with {pn} to unfollow its sender"
		}
	},

	langs: {
		en: {
			syntaxError: "⚠️ Reply to a message, tag someone, or enter a username / profile link / uid to unfollow",
			success: "✅ Unfollowed %1",
			failed: "❌ Failed to unfollow %1: %2",
			notFound: "❌ Could not resolve %1",
			rateLimited: "⏳ Instagram is throttling lookups, try again shortly (%1)"
		}
	},

	onStart: async function ({ api, event, args, message, getLang }) {
		const hasInput = (event.messageReply && event.messageReply.senderID)
			|| (event.mentions && Object.keys(event.mentions).length) || args.length;
		if (!hasInput) return message.reply(getLang("syntaxError"));
		const targets = await collectTargets(event, args, api);

		let msg = "";
		for (const t of targets) {
			if (t.error) { msg += getLang(t.rateLimited ? "rateLimited" : "notFound", t.label) + "\n"; continue; }
			try {
				await api.unfollow(t.id);
				msg += getLang("success", t.label) + "\n";
			}
			catch (e) {
				msg += getLang("failed", t.label, errText(e)) + "\n";
			}
		}
		return message.reply(msg.trim());
	}
};
