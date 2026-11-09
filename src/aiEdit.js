"use strict";

/**
 * aiedit — reply to a photo, then:
 *   -gptedit <what to change>   (GPT image edit)
 *   -mjedit  <what to change>   (Midjourney edit)
 * Works on one photo: reply to the photo with the command.
 * Two photos: reply to the 2nd photo with "--2" added at the end (the image is taken from your previous photo in this chat).
 *
 * ENDPOINT IS A GUESS: "/api/image/edit2" with params {model, prompt, image}.
 * Change EDIT_ENDPOINT / params below once the real edit2 URL is known.
 */

const axios = require("axios");

const BASE = "https://toshiro-api-editz6t9.vercel.app";
const EDIT_ENDPOINT = "/api/image/edit2";

// Find the photo a command was replied to. The reply payload often has no attachments,
// so fall back to the photo cache filled by events/onMessage.js (by message id, then the
// newest photo from that person in this thread within 30 minutes).
function replyPhoto(event) {
	const replied = event.messageReply;
	const direct = photoUrl(replied && replied.attachments) || photoUrl(event.attachments);
	if (direct) return direct;
	const byMsg = global.__photoByMsg;
	if (!byMsg || !replied) return null;
	if (replied.messageID != null && byMsg.has(String(replied.messageID))) return byMsg.get(String(replied.messageID)).urls[0];
	const who = String(replied.senderID || "");
	const thread = String(event.threadID || "");
	const now = Date.now();
	let best = null;
	for (const rec of byMsg.values()) {
		if (rec.threadID !== thread || now - rec.at > 30 * 60 * 1000) continue;
		if (who && rec.senderID !== who) continue;
		if (!best || rec.at > best.at) best = rec;
	}
	return best ? best.urls[0] : null;
}

function photoUrl(attachments) {
	const a = (attachments || []).find(x => x && (x.type === "photo" || x.type === "sticker"));
	return a ? (a.url || a.largePreviewUrl || a.previewUrl || null) : null;
}

async function editWith(model, imageUrl, prompt) {
	const res = await axios.get(BASE + EDIT_ENDPOINT, {
		params: { model, prompt, image: imageUrl },
		responseType: "arraybuffer",
		timeout: 240000,
		validateStatus: () => true
	});
	if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
	const type = String(res.headers["content-type"] || "");
	if (!/^image\//i.test(type)) throw new Error("API chobi pathay nai");
	const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
	return { buffer: Buffer.from(res.data), ext };
}

function make(commandName, model, label) {
	return {
		config: {
			name: commandName,
			version: "1.0",
			author: "InstaBOT",
			countDown: 20,
			role: 0,
			category: "image",
			description: { en: `Edit a replied photo with ${label}` },
			guide: { en: `{pn} <what to change>  (reply to a photo)` }
		},

		onStart: async function ({ api, event, args, message, prefix }) {
			const react = emoji => Promise.resolve(api.setMessageReaction(emoji, event.messageID)).catch(() => { });
			const prompt = args.join(" ").trim();
			if (!prompt) return message.reply(`✏️ Ki change korbo bolo.\nExample: ${prefix || "-"}${commandName} make it night`);

			const img = replyPhoto(event);
			if (!img) return message.reply("⚠️ Ekta photo te reply diye command dao.");

			await react("⏳");
			try {
				const out = await editWith(model, img, prompt);
				await message.reply({ attachment: [{ buffer: out.buffer, fileName: `${commandName}.${out.ext}` }] });
				await react("✅");
			}
			catch (e) {
				console.error(`[${commandName}] failed:`, (e && e.message) || e);
				await react("❌");
				return message.reply(`❌ Edit hoyni: ${((e && e.message) || "try again").toString().slice(0, 200)}`);
			}
		}
	};
}

module.exports = { make, editWith, replyPhoto };
