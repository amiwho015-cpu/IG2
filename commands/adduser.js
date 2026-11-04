"use strict";

/**
 * adduser — add one or more people to the current group.
 *
 *   -adduser 1234567890                 numeric user id
 *   -adduser @username                  username
 *   -adduser https://instagram.com/xyz  profile link
 *   -adduser a b c                      up to 5 at once (ids / @usernames / links)
 *   (reply to someone's message)        adds that person
 *
 * Works on every ig-chat-api build (addUserToThread / addUserToGroup). Instagram
 * refuses to add an account the bot does not follow, so on failure the bot follows
 * that account and retries once. People already in the group are reported, not re-added.
 *
 * Author: Neoaz 🐊 (rewritten by Shihab)
 */

const { collectTargets, joinUser, errText } = require("../src/igActions");

module.exports = {
	config: {
		name: "adduser",
		aliases: ["addtouser", "addmember"],
		author: "Neoaz 🐊",
		category: "admin",
		cooldown: 2,
		role: 2,
		noPrefix: true,
		description: { en: "Add a user to the current thread" },
		usage: { en: "{p}adduser <userID | @handle | profile URL> [more...] — or reply to a message" }
	},

	onStart: async function ({ message, args, event, api }) {
		if (!event.isGroup)
			return message.reply("❌ Ei command shudhu group e kaj kore.");

		const targets = await collectTargets(event, args, api, 5);
		if (!targets.length)
			return message.reply("❌ User id, @username ba profile link dao — othoba kono user er message e reply koro.");

		const lines = [];
		for (const t of targets) {
			if (t.error) {
				lines.push(t.rateLimited
					? `⏳ ${t.label}: Instagram ekhon lookup block korse, kichukkhon pore try koro.`
					: `❌ ${t.label}: user khuje pawa jayni.`);
				continue;
			}
			try {
				const res = await joinUser(api, t.id, event.threadID);
				if (res.already) lines.push(`ℹ️ ${t.label}: age thekei group e ache.`);
				else lines.push(`✅ ${t.label}: group e add kora hoyeche${res.followed ? " (bot follow kore add korse)" : ""}.`);
			}
			catch (error) {
				lines.push(`❌ ${t.label}: add kora gelo na (${errText(error).slice(0, 120)})`);
			}
		}
		return message.reply(lines.join("\n"));
	}
};
