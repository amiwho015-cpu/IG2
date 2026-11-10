"use strict";

/**
 * igchat - a fake Instagram DM screenshot (drawn locally, no API), styled like the real app.
 *
 *   {pn} <text>                      reply to someone / @tag / uid, then the text
 *   {pn} Hi | Kmn acho | Valo achi   "|" splits messages. They alternate: first from them (left),
 *                                    second from you (right), and so on.
 *   > text   or   me: text           forces a message to the right (sent by you)
 *   < text   or   them: text         forces a message to the left (sent by them)
 *   text +😂   (also +haha +love +wow +sad +angry +like)   puts a reaction under that message
 *   ## YESTERDAY 9:05 PM             a time label in the middle of the chat
 *   #new                             the "New messages" divider      text +edited   the blue "Edited" label
 *   emoji at the end of a message (😂🤣😄😍😭😮😡❤👍) are drawn; other emoji are dropped
 *   --light  light mode      --noseen  hide "Seen"      --noring  no story ring on the avatar
 *   --nodate no automatic time label     --intro  start with the big profile block + "View profile"
 *   --bat 98  battery      --time 6:28  clock
 *
 * Author: Shihab
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const Canvas = require("canvas");
const { hdProfilePicture } = require("../src/hdpic");
const chat = require("../src/igChat");

const MAX_MESSAGES = 14;
const MAX_CHARS = 300;

function parseMessages(raw) {
	const out = [];
	let nextSide = "l";
	let count = 0;
	for (const part of String(raw).split("|")) {
		let text = part.trim();
		if (!text) continue;

		if (/^#new$/i.test(text)) { out.push({ kind: "divider", text: "New messages" }); continue; }

		// "## YESTERDAY 9:05 PM" = a time label
		if (text.startsWith("##")) {
			const label = text.replace(/^#+\s*/, "").trim();
			if (label) out.push({ kind: "date", text: label.slice(0, 40) });
			continue;
		}

		let side = null;
		const m = text.match(/^(?:(>|<)|(me|you|mine)\s*:|(them|him|her|they)\s*:)\s*/i);
		if (m) {
			side = m[1] === ">" || m[2] ? "r" : "l";
			text = text.slice(m[0].length).trim();
		}

		// a trailing "+😂" / "+haha" is a reaction under the message
		let reaction = null;
		const r = text.match(/\s\+(\S+)\s*$/) || text.match(/^\+(\S+)\s*$/);
		let edited = false;
		if (r) {
			if (/^edited$/i.test(r[1])) edited = true; else reaction = r[1];
			text = text.slice(0, r.index).trim();
		}

		if (!text && !reaction) continue;
		side = side || nextSide;
		out.push({ kind: "msg", side, text: text.slice(0, MAX_CHARS), reaction, edited });
		nextSide = side === "l" ? "r" : "l";
		if (++count >= MAX_MESSAGES) break;
	}
	return out;
}

function stamp(date = new Date(), timeZone = "Asia/Dhaka") {
	const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(date);
	return { timeText: time.replace(/\s?[AP]M$/i, ""), dateText: time };
}

module.exports = {
	config: {
		name: "igchat",
		aliases: ["ifc", "igfake", "fakeig"],
		version: "2.0",
		author: "Shihab",
		countDown: 6,
		role: 0,
		category: "FUN & SOCIAL",
		shortDescription: "Fake Instagram chat screenshot",
		guide: {
			en: "Reply to someone (or @tag / uid) and write:\n{pn} Hi | Kmn acho | Valo achi\n\"|\" splits messages, they alternate left (them) / right (you).\n> text = from you, < text = from them\ntext +😂 = reaction, text +edited = Edited label\n## YESTERDAY 9:05 PM = time label, #new = New messages line\n--light --noseen --noring --nodate --intro --bat 98 --time 6:28"
		}
	},

	onStart: async function ({ event, args, message, usersData }) {
		let light = false, seen = true, ring = true, autoDate = true, intro = false, battery = null, timeText = null;
		const words = [];
		for (let i = 0; i < args.length; i++) {
			const low = String(args[i]).toLowerCase();
			if (low === "--light") light = true;
			else if (low === "--dark") light = false;
			else if (low === "--noseen") seen = false;
			else if (low === "--noring") ring = false;
			else if (low === "--nodate") autoDate = false;
			else if (low === "--intro") intro = true;
			else if (low === "--bat" || low === "--battery") { const n = parseInt(args[++i], 10); if (Number.isFinite(n)) battery = Math.max(1, Math.min(100, n)); }
			else if (low === "--time") { const m = String(args[++i] || "").match(/^(\d{1,2}):(\d{2})$/); if (m && +m[1] < 24 && +m[2] < 60) timeText = `${+m[1] % 12 || 12}:${m[2]}`; }
			else words.push(args[i]);
		}

		const reply = event.messageReply;
		const mentionIDs = Object.keys(event.mentions || {});
		let targetID = (reply && reply.senderID) || mentionIDs[0] || null;
		if (!targetID && words.length && /^\d{5,}$/.test(words[0])) targetID = words.shift();
		if (!targetID) return message.reply("❌ Someone's message e reply koro, ba @tag koro, ba uid dao.\nExample: -igchat Hi | Kmn acho | Valo achi");
		targetID = String(targetID);

		let raw = words.join(" ");
		for (const tag of Object.values(event.mentions || {})) raw = raw.split(String(tag)).join(" ");
		raw = raw.replace(/@\S+/g, " ").trim();
		const messages = parseMessages(raw);
		if (!messages.some(m => m.kind === "msg")) return message.reply("❌ Chat-er lekha dao.\nExample: -igchat Hi | Kmn acho | Valo achi\n(\"|\" diye alada message, > diye tomar message)");

		let name = null, username = null, avatarUrl = null;
		try { name = await usersData.get(targetID, "name"); } catch (_) { /* optional */ }
		try { username = await usersData.get(targetID, "username"); } catch (_) { /* optional */ }
		try { avatarUrl = await usersData.getAvatarUrl(targetID); } catch (_) { /* optional */ }

		let avatar = null;
		try {
			const hd = await hdProfilePicture(targetID, [avatarUrl]);
			if (hd && hd.buffer) avatar = await Canvas.loadImage(hd.buffer);
		}
		catch (_) { /* try the plain link */ }
		if (!avatar && avatarUrl) { try { avatar = await Canvas.loadImage(avatarUrl); } catch (_) { /* silhouette */ } }

		const when = stamp();
		const items = autoDate && messages[0].kind !== "date" ? [{ kind: "date", text: when.dateText }, ...messages] : messages;
		const buffer = chat.render(Canvas, {
			theme: light ? "light" : "dark",
			name: (typeof name === "string" && !/^User \d+$/.test(name) ? name : null) || username || "Instagram User",
			username: username ? String(username).replace(/^@/, "") : "",
			avatar,
			items,
			seen,
			ring,
			intro,
			battery: battery != null ? battery : 20 + Math.floor(Math.random() * 81),
			speed: (0.5 + Math.random() * 29).toFixed(1),
			timeText: timeText || when.timeText
		});

		const file = path.join(os.tmpdir(), `igchat_${targetID}_${Date.now()}.jpg`);
		fs.writeFileSync(file, buffer);
		try { await message.reply({ attachment: fs.createReadStream(file) }); }
		finally { setTimeout(() => fs.unlink(file, () => { }), 20000).unref(); }
	}
};
