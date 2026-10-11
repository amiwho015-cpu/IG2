"use strict";

/**
 * spy — Instagram user info (InstaBOT version)
 * Uses the bot's own logged-in session (api.getUserInfo + account.txt cookies),
 * so it does NOT need a separate IG_SESSIONID.
 * Put this file in /commands/spy.js (replace the old one).
 */

const axios = require("axios");
const { resolveProfile, resolveUserTarget, isRateLimitError } = require("../src/utils");

const IG_APP_ID = "936619743392459";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Build a Cookie header from the bot's own account.txt (if present locally).
function botCookieHeader() {
	try {
		const { loadAccount } = require("../src/config");
		const cookies = loadAccount();
		const keep = ["sessionid", "ds_user_id", "csrftoken", "mid", "ig_did"];
		return cookies
			.filter(c => keep.includes(c.key))
			.map(c => `${c.key}=${c.value}`)
			.join("; ");
	}
	catch (_) {
		return "";
	}
}

const COOKIE = botCookieHeader();
const HEADERS = Object.assign(
	{ "User-Agent": UA, "X-IG-App-ID": IG_APP_ID, Accept: "*/*" },
	COOKIE ? { Cookie: COOKIE } : {}
);

async function getJSON(url) {
	try {
		const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
		return res.data;
	}
	catch (_) {
		return null;
	}
}

const yn = v => (v ? "Yes" : "No");
const num = v => (v == null ? "N/A" : String(v));
const pick = (...vals) => vals.find(v => v !== undefined && v !== null && v !== "");

module.exports = {
	config: {
		name: "spy",
		aliases: ["iginfo", "stalk"],
		author: "CRX Shihab",
		category: "info",
		cooldown: 8,
		role: 0,
		description: { en: "Detailed Instagram user info + HD profile picture" },
		usage: { en: "{p}spy [userID | @handle | username | profile URL] — or reply to a message" }
	},

	onStart: async function ({ message, args, event, api }) {
		const target = await resolveUserTarget(args, event, api);
		if (!target.id) {
			if (target.rateLimited) return message.reply("⏳ Instagram rate-limit korse. Kichukkhon pore try koro.");
			if (target.username) return message.reply(`❌ @${target.username} paoa jay nai.`);
			return message.reply("⚠️ Username, user ID dao ba kono message e reply koro.\nExample: spy tanvir143.ig.robot");
		}

		const profile = await resolveProfile(args, event, api);
		if (!profile) return message.reply(`❌ User ${target.id} paoa jay nai.`);
		if (profile.rateLimited && !profile.username && !profile.name)
			return message.reply("⏳ Instagram rate-limit korse. Kichukkhon pore try koro.");

		const userID = String(profile.userID || target.id);

		// Extra details (best effort, all optional)
		let web = null;
		if (profile.username) {
			const d = await getJSON(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(profile.username)}`);
			const u = d && d.data && d.data.user;
			if (u && String(u.id) === userID) web = u;
		}
		const priv = COOKIE ? await getJSON(`https://i.instagram.com/api/v1/users/${userID}/info/`) : null;
		const pu = priv && priv.user;
		const fr = COOKIE ? await getJSON(`https://i.instagram.com/api/v1/friendships/show/${userID}/`) : null;

		let friendship = "N/A";
		if (fr) {
			if (fr.following && fr.followed_by) friendship = "Mutual";
			else if (fr.following) friendship = "Following";
			else if (fr.followed_by) friendship = "Follows you";
			else if (fr.outgoing_request) friendship = "Request sent";
			else friendship = "Not following";
		}

		const name = pick(profile.name, web && web.full_name, pu && pu.full_name) || "None";
		const username = pick(profile.username, web && web.username, pu && pu.username) || "None";
		const bio = String(pick(profile.biography, web && web.biography, pu && pu.biography) || "None").replace(/\n/g, " ");
		const business = web ? web.is_business_account : (pu ? pu.is_business : undefined);
		const fbid = pick(web && web.fbid, pu && pu.fbid_v2, pu && pu.fbid);
		const interop = pick(pu && pu.interop_messaging_user_fbid);
		const strong = pick(pu && pu.strong_id__, userID);

		const body =
`╭─ 👤 INSTAGRAM INFO ─
│ Username: ${username}
│ Name: ${name}
│ First name: ${String(name).split(" ")[0]}
│ User ID: ${userID}
│ Followers: ${num(pick(profile.followers, web && web.edge_followed_by && web.edge_followed_by.count))}
│ Following: ${num(pick(profile.following, web && web.edge_follow && web.edge_follow.count))}
│ Private: ${yn(profile.isPrivate)}
│ Verified: ${yn(profile.isVerified)}
│ Business: ${business === undefined ? "N/A" : yn(business)}
│ Friendship: ${friendship}
│ Biography: ${bio}
│ fbid: ${num(fbid)}
│ Interop fbid: ${num(interop)}
│ Strong ID: ${strong}
╰──────────────────`;

		// Best picture quality available
		const pic = pick(
			pu && pu.hd_profile_pic_url_info && pu.hd_profile_pic_url_info.url,
			web && web.profile_pic_url_hd,
			profile.profilePicture
		);

		// message.reply sends the text first, then the picture (like your screenshot)
		if (pic) return message.reply({ body, attachment: pic, textFirst: true });
		return message.reply(body);
	}
};
                                   
