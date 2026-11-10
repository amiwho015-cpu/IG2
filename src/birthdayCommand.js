"use strict";

/**
 * Shared logic for the birthday commands.
 *   birthday / birthday2 / birthday3   hand-drawn designs (no API, never fails)
 *   birthdayai                          the background is made by the same AI models as genx
 *                                       (falls back to a drawn design if the AI is slow or fails)
 * Author: Shihab
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const Canvas = require("canvas");
const nkx = require("./nkxClient");
const { hdProfilePicture } = require("./hdpic");
const { resolveGender } = require("./gender");
const card = require("./birthdayCard");

/** A name the card font can draw (Latin letters); falls back to the @username. */
function drawableName(name, username) {
	const clean = s => String(s || "").replace(/[^\p{Script=Latin}\p{N}\s.'_-]/gu, "").replace(/\s+/g, " ").trim();
	return clean(name).length >= 2 ? clean(name).slice(0, 28) : (clean(username) || "Friend");
}

const BOY_WORDS = new Set(["boy", "male", "man", "chele", "ছেলে"]);
const GIRL_WORDS = new Set(["girl", "female", "woman", "meye", "মেয়ে"]);

/* ------------------------------------------------------------- AI background */

// Same models as genx (13-27, the NKX GEN ones). Default 13 = Nano Banana 2.
const AI_MODELS = {
	13: "nano-banana-2", 14: "gpt-image-2-low", 15: "flux-2-dev", 16: "flux-2-flex", 17: "flux-2-pro",
	18: "flux-krea", 19: "ideogram-v3-turbo", 20: "seedream-4", 21: "seedream-4-5", 22: "seedream-5",
	23: "qwen-image-2", 24: "qwen-image-2-pro", 25: "gemini-2-5-flash-image",
	26: "gpt-image-2-5-flare-low", 27: "gpt-image-2-5-sunburst-low"
};
const AI_DEFAULT_MODEL = 13;
const AI_TIMEOUT_MS = 100000;

const AI_STYLES = {
	boy: [
		"luxury dark navy blue and gold birthday party background, golden balloons, glittering confetti, cinematic fireworks, bokeh lights",
		"dark royal blue and electric cyan birthday celebration background, neon fireworks, floating metallic balloons, light rays, bokeh",
		"black and gold premium birthday background, gold streamers, shiny confetti, sparkling stars, dramatic light",
		"deep green and gold birthday celebration background, golden balloons and ribbons, glowing lanterns, sparkles, bokeh"
	],
	girl: [
		"soft pink and rose gold birthday party background, pastel balloons, flower petals falling, sparkles, dreamy bokeh",
		"blush pink and lavender birthday background, watercolor roses and peonies, heart balloons, glitter, soft light",
		"pastel pink and peach birthday celebration background, butterflies, fairy lights, flower garlands, golden sparkles",
		"magenta and rose birthday background, fresh flowers at the corners, shiny balloons, confetti, glowing bokeh"
	],
	any: [
		"colorful festive birthday party background, balloons, confetti, streamers, bright bokeh lights",
		"purple and gold birthday celebration background, balloons, sparkling confetti, glowing lights",
		"turquoise and orange birthday party background, balloons, ribbons, confetti, cheerful light"
	]
};

function aiPrompt(gender) {
	const pool = gender === 1 ? AI_STYLES.boy : gender === 2 ? AI_STYLES.girl : AI_STYLES.any;
	const style = pool[Math.floor(Math.random() * pool.length)];
	return `${style}. Vertical greeting card background, decorations only around the edges. ` +
		"Keep the center and the lower half calm and less detailed so a photo and text can be placed on top. " +
		"No text, no letters, no words, no numbers, no people, no faces, no logos.";
}

function withTimeout(promise, ms, label) {
	let timer;
	const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); });
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Ask the image API for a background and load it. Throws on any problem so the caller can fall back. */
async function makeAiBackground(gender, modelId) {
	const payload = { prompt: aiPrompt(gender), model: AI_MODELS[modelId], ratio: "2:3", resolution: "2k", wait: true };
	const url = await withTimeout(nkx.runJob(payload), AI_TIMEOUT_MS, "AI background");
	const file = await nkx.downloadToTemp(url, "bdayai");
	try { return await Canvas.loadImage(file); }
	finally { fs.unlink(file, () => { }); }
}

/* ------------------------------------------------------------------- command */

function make(designNumber, name, aliases, opts = {}) {
	const ai = Boolean(opts.ai);
	return {
		config: {
			name,
			aliases,
			version: "2.1",
			author: "Shihab",
			countDown: ai ? 15 : 8,
			role: 0,
			category: "image",
			shortDescription: ai ? "Birthday card with an AI made background" : `Birthday card, design ${designNumber} (long wish, boy/girl wishes)`,
			guide: {
				en: "Reply to a message with {pn} → birthday card for that person\n{pn} @user → card for the tagged person\n{pn} girl / {pn} boy → force the girl or boy wish\n{pn} <your wish> → your own wish text on the card" +
					(ai ? "\n{pn} --m <13-27> → pick the genx AI model (default 13)" : "")
			}
		},

		onStart: async function ({ api, event, args, message, usersData }) {
			const reply = event.messageReply;
			const mentionIDs = Object.keys(event.mentions || {});
			const targetID = String((reply && reply.senderID) || mentionIDs[0] || event.senderID);

			// Options first: --m <model>, then an optional boy / girl word.
			let modelId = AI_DEFAULT_MODEL;
			const words = [];
			for (let i = 0; i < args.length; i++) {
				const low = String(args[i]).toLowerCase();
				if (ai && (low === "--m" || low === "--model")) {
					const n = parseInt(args[++i], 10);
					if (AI_MODELS[n]) modelId = n;
				}
				else words.push(args[i]);
			}
			let forced = 0;
			if (words.length && BOY_WORDS.has(String(words[0]).toLowerCase())) { forced = 1; words.shift(); }
			else if (words.length && GIRL_WORDS.has(String(words[0]).toLowerCase())) { forced = 2; words.shift(); }

			// Anything else typed after the command (and tag) is the custom wish.
			let wish = words.join(" ");
			for (const tag of Object.values(event.mentions || {})) wish = wish.split(String(tag)).join(" ");
			wish = wish.replace(/@\S+/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);

			let userName = null, username = null, avatarUrl = null;
			try { userName = await usersData.get(targetID, "name"); } catch (_) { /* optional */ }
			try { username = await usersData.get(targetID, "username"); } catch (_) { /* optional */ }
			try { avatarUrl = await usersData.getAvatarUrl(targetID); } catch (_) { /* optional */ }

			let gender = forced;
			if (!gender) { try { gender = (await resolveGender(usersData, targetID)).gender || 0; } catch (_) { gender = 0; } }

			// HD picture first, the plain avatar link as the fallback, a silhouette last.
			let img = null;
			try {
				const hd = await hdProfilePicture(targetID, [avatarUrl]);
				if (hd && hd.buffer) img = await Canvas.loadImage(hd.buffer);
			}
			catch (_) { /* try the plain link */ }
			if (!img && avatarUrl) { try { img = await Canvas.loadImage(avatarUrl); } catch (_) { /* silhouette */ } }

			// AI mode: a background from the genx models. Any failure = the drawn design instead.
			let bg = null, theme = designNumber;
			if (ai) {
				theme = gender === 1 ? 3 : gender === 2 ? 2 : 1;      // ornaments + colours match the wish
				nkx.react(api, event.messageID, "⏳");
				try { bg = await makeAiBackground(gender, modelId); }
				catch (e) { console.error("[birthdayai] AI background failed, using the drawn design:", e && e.message); }
				nkx.react(api, event.messageID, bg ? "✅" : "⚠️");
			}

			const now = new Date();
			const when = card.stamp(now);
			const seed = parseInt(String(targetID).slice(-6), 10) + Math.floor(now.getTime() / 86400000);
			const buffer = card.render(Canvas, {
				img,
				bg,
				theme,
				gender,
				name: drawableName(userName, username),
				wish: wish || card.pickWish(gender, Number.isFinite(seed) ? seed : 0),
				dateLine: when.dateLine,
				timeLine: when.timeLine
			});

			const file = path.join(os.tmpdir(), `birthday${ai ? "ai" : designNumber}_${targetID}_${Date.now()}.jpg`);
			fs.writeFileSync(file, buffer);
			try {
				await message.reply({ body: `🎂 Happy Birthday ${userName || username || ""}! 🎉`.replace("  ", " "), attachment: fs.createReadStream(file) });
			}
			finally {
				setTimeout(() => fs.unlink(file, () => { }), 20000).unref();
			}
		}
	};
}

module.exports = { make, AI_MODELS, aiPrompt };
