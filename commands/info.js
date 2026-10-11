"use strict";

/**
 * info — all Instagram information of a user (ported from Insta-Bot3).
 * Put this file in /commands/info.js
 *
 *   info                    your own info
 *   info @tag               tagged people
 *   info <username|link>    a username or profile link
 *   (reply to a message)    info of that message's sender
 */

const { resolveUserTarget } = require("../src/utils");

function formatBlock(u) {
	const raw = u.raw || {};
	const line = (k, v) => v === undefined || v === null || v === "" || v === false ? null : `│ ${k}: ${v}`;
	const bool = v => v ? "Yes" : "No";
	const lines = [
		"╭─ 👤 INSTAGRAM INFO ─",
		line("Username", u.username),
		line("Name", u.name),
		line("First name", u.firstName),
		line("User ID", u.id || u.userID),
		line("Followers", u.followerCount),
		line("Following", u.followingCount),
		line("Posts", u.mediaCount),
		line("Private", bool(u.isPrivate)),
		line("Verified", bool(u.isVerified)),
		line("Business", bool(u.isBusiness)),
		line("Category", raw.category_name || raw.category),
		line("Friendship", u.isFriend ? "Following" : "Not following"),
		line("Biography", String(u.biography || "").replace(/\n/g, " ").trim()),
		line("External URL", u.externalUrl),
		line("fbid", raw.fbid_v2 || raw.fbid),
		line("Interop fbid", raw.interop_messaging_user_fbid),
		line("Strong ID", raw.strong_id__),
		"╰─────────────────────"
	];
	return lines.filter(Boolean).join("\n");
}

module.exports = {
	config: {
		name: "info",
		aliases: ["userinfo", "iginfo2"],
		author: "Neoaz 🐊",
		category: "info",
		cooldown: 5,
		role: 0,
		description: { en: "View all Instagram information of a user" },
		usage: { en: "{p}info [@tag | username | profile link] — or reply to a message" }
	},

	onStart: async function ({ api, message, event, args }) {
		const targets = [];

		if (event.messageReply) {
			targets.push({ id: event.messageReply.senderID });
		}
		else if (!args[0]) {
			targets.push({ id: event.senderID });
		}
		else {
			const mentions = event.mentions;
			if (mentions && Object.keys(mentions).length) {
				for (const id of Object.keys(mentions))
					targets.push({ id, label: String(mentions[id] || "").replace(/^@/, "") });
			}
			else {
				for (const arg of args) {
					try {
						const t = await resolveUserTarget([arg], event, api);
						if (t && t.id) targets.push({ id: t.id, label: arg });
						else if (t && t.rateLimited) targets.push({ error: "Instagram rate-limit korse, kichukkhon pore try koro.", label: arg });
						else targets.push({ error: "user paoa jay nai", label: arg });
					}
					catch (e) {
						targets.push({ error: e.message || String(e), label: arg });
					}
				}
			}
		}

		const ids = targets.filter(t => t.id).map(t => String(t.id));
		let infoMap = {};
		if (ids.length) {
			try {
				infoMap = await api.getUserInfo(ids) || {};
			}
			catch (e) {
				return message.reply(`❌ An error occurred while fetching information: ${e.error || e.message || String(e)}`);
			}
		}

		const blocks = [];
		let firstPic = null;
		for (const t of targets) {
			if (t.error) {
				blocks.push(`⚠️ ${t.label}: ${t.error}`);
			}
			else if (!infoMap[t.id]) {
				blocks.push("❌ Could not find Instagram information for this user" + (t.label ? ` (${t.label})` : ""));
			}
			else {
				const u = infoMap[t.id];
				if (!firstPic && u.thumbSrc) firstPic = u.thumbSrc;
				blocks.push(formatBlock(u));
			}
		}

		const body = blocks.join("\n\n") || "❌ Could not find Instagram information for this user";
		if (!firstPic) return message.reply(body);
		try {
			return await message.reply({ body, attachment: firstPic, textFirst: true });
		}
		catch (_) {
			return message.reply(body);
		}
	}
};
