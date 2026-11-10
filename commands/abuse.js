"use strict";

/**
 * abuse — manage the "swearing at the bot" warning system (see events/onAbuse.js). Bot admins only.
 *   -abuse info [reply|id]    warnings of someone
 *   -abuse reset [reply|id]   clear warnings and unban
 *   -abuse list               everyone with warnings / banned for abuse
 */

function targetId(args, event) {
	if (event.messageReply && event.messageReply.senderID) return String(event.messageReply.senderID);
	const num = args.find(a => /^\d+$/.test(a));
	if (num) return String(num);
	const tagged = Object.keys(event.mentions || {})[0];
	return tagged ? String(tagged) : null;
}

module.exports = {
	config: {
		name: "abuse",
		aliases: ["gali", "abusewarn"],
		author: "InstaBOT",
		category: "admin",
		cooldown: 2,
		role: 2,
		description: { en: "Manage the warning system for people who swear at the bot" },
		usage: { en: "{p}abuse info [reply|id]\n{p}abuse reset [reply|id]\n{p}abuse list" }
	},

	onStart: async function ({ message, args, event, usersData, config }) {
		const sub = String(args[0] || "").toLowerCase();
		const limit = (config.abuse && config.abuse.warnLimit) || 2;

		if (sub === "list") {
			const rows = usersData.all().filter(u => u && u.abuse && u.abuse.warns > 0)
				.sort((a, b) => b.abuse.warns - a.abuse.warns).slice(0, 25)
				.map(u => `${u.name || u.userID} (${u.userID}): ${Math.min(u.abuse.warns, limit)}/${limit}${u.banned && u.banned.status ? " 🚫 banned" : ""}`);
			return message.reply(rows.length ? `⚠️ Warned users:\n${rows.join("\n")}` : "✅ Kew warn hoy nai.");
		}

		const id = targetId(args.slice(1), event);
		if (!id) return message.reply("Reply to a user (or give an id).\n-abuse info | reset | list");
		const u = usersData.get(id);

		if (sub === "reset" || sub === "unban") {
			if (!u) return message.reply("User not found.");
			usersData.update(id, { abuse: { warns: 0, last: null }, banned: { status: false, reason: null, date: null } });
			return message.reply(`✅ ${u.name || id} er warning clear + unban kora hoyeche.`);
		}

		const warns = u && u.abuse ? u.abuse.warns : 0;
		return message.reply(`ℹ️ ${(u && u.name) || id}: ${Math.min(warns, limit)}/${limit} warning${u && u.banned && u.banned.status ? `\n🚫 Banned: ${u.banned.reason}` : ""}`);
	}
};
