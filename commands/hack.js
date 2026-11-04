"use strict";

/**
 * hack - a prank. Fake "hacking" steps, then a look-alike of Instagram's "Save your login info?"
 * screen with the target's @username and photo as the joke proof.
 *   The clock shows the real current time (Bangladesh), the battery level and the charging bolt are
 *   different every time.
 *
 *   {pn}                      -> on yourself
 *   {pn} @user / reply / uid  -> on that person
 *   --bat 45                  -> choose the battery level
 *   --time 06:50              -> choose the clock
 *
 * It is a joke image: no real login happens. Use it on friends who are in on the joke.
 * Author: Shihab
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const Canvas = require("canvas");
const { hdProfilePicture } = require("../src/hdpic");
const card = require("../src/igLoginCard");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function nowTime(timeZone = "Asia/Dhaka") {
	return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

module.exports = {
	config: {
		name: "hack",
		version: "3.0",
		author: "Shihab",
		countDown: 8,
		role: 0,
		category: "FUN & SOCIAL",
		shortDescription: "Prank: fake hack with an Instagram login screen",
		longDescription: "Fake hacking steps, then an Instagram \"Save your login info?\" screen with the target's username and photo. Clock = real time, battery changes every time.",
		guide: { en: "{pn} @mention / reply / uid — prank on that person\n{pn} --bat 45 --time 06:50 — pick the battery or clock\n(a joke image, no real login happens)" }
	},

	onStart: async function ({ api, event, args, message, usersData }) {
		let battery = null, timeText = null;
		const words = [];
		for (let i = 0; i < args.length; i++) {
			const low = String(args[i]).toLowerCase();
			if (low === "--bat" || low === "--battery") {
				const n = parseInt(args[++i], 10);
				if (Number.isFinite(n)) battery = Math.max(1, Math.min(100, n));
			}
			else if (low === "--time") {
				const m = String(args[++i] || "").match(/^(\d{1,2}):(\d{2})$/);
				if (m && +m[1] < 24 && +m[2] < 60) timeText = `${m[1].padStart(2, "0")}:${m[2]}`;
			}
			else words.push(args[i]);
		}

		const reply = event.messageReply;
		const mentionIDs = Object.keys(event.mentions || {});
		let targetID = (reply && reply.senderID) || mentionIDs[0] || null;
		if (!targetID && words.length && /^\d{5,}$/.test(words[0])) targetID = words[0];
		targetID = String(targetID || event.senderID);

		const react = emoji => Promise.resolve(api.setMessageReaction(emoji, event.messageID)).catch(() => { });
		await react("⏳");

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

		const shown = (username && String(username).replace(/^@/, "")) ||
			(typeof name === "string" && !/^User \d+$/.test(name) ? name.toLowerCase().replace(/\s+/g, "_") : "instagram_user");

		// the joke "hacking" steps (they edit one message when the host can edit, otherwise they are skipped)
		let status = null;
		try { status = await message.reply("💻 Initializing hack..."); } catch (_) { /* optional */ }
		if (status && status.messageID && typeof api.editMessage === "function") {
			for (const step of ["> ACCESSING DATABASE...", "> DECRYPTING FILES...", "> BYPASSING FIREWALL...", "> LOGIN SESSION FOUND"]) {
				await sleep(1500);
				try { await api.editMessage(`💻 Hacking in progress...\n\n${step}`, status.messageID); } catch (_) { break; }
			}
			await sleep(800);
		}

		const buffer = card.render(Canvas, {
			username: shown,
			avatar,
			timeText: timeText || nowTime(),
			battery: battery != null ? battery : 8 + Math.floor(Math.random() * 93),
			charging: Math.random() < 0.5,
			tabs: 2 + Math.floor(Math.random() * 98),
			speed: (0.5 + Math.random() * 29).toFixed(1)
		});

		const file = path.join(os.tmpdir(), `hack_${targetID}_${Date.now()}.jpg`);
		fs.writeFileSync(file, buffer);
		try {
			if (status && status.messageID) { try { await api.unsendMessage(status.messageID); } catch (_) { /* already gone */ } }
			await message.reply({ attachment: fs.createReadStream(file) });
			await react("✅");
		}
		finally { setTimeout(() => fs.unlink(file, () => { }), 20000).unref(); }
	}
};
