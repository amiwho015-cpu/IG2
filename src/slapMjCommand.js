"use strict";

/**
 * Shared code for slap1 .. slap5: the sender slaps the person they reply to (or @user).
 * Both profile pictures go to Midjourney as image prompts with a slap scene text.
 * Midjourney only takes the photos as a reference, so faces look similar, not identical.
 */

const axios = require("axios");
const tz = require("./toshiro");
const { hdProfilePicture } = require("./hdpic");
const { uploadPublic } = require("./naginCommand");
const { resolveUserTarget, resolveProfile } = require("./utils");

const BASE = "the person from the first reference photo slaps the person from the second reference photo hard across the face, both faces clearly visible and matching the reference photos, ";
const STYLES = {
	1: { title: "Bollywood Slap", text: BASE + "dramatic Bollywood movie scene, slow motion, hair flying, shocked expression, cinematic lighting, ultra detailed, 8k" },
	2: { title: "Anime Slap", text: BASE + "anime style, speed lines and impact effects, big slap sound effect, vibrant colours, high quality illustration" },
	3: { title: "Funny 3D Slap", text: BASE + "funny Pixar-style 3D cartoon, cheek wobbling from the slap, exaggerated expressions, bright colourful background" },
	4: { title: "Rainy Night Slap", text: BASE + "rainy night street, neon lights, intense dramatic confrontation, cinematic photography, ultra detailed" },
	5: { title: "TV Serial Slap", text: BASE + "over-dramatic Indian TV serial scene, three camera zooms feeling, bright sparkling background, shocked family watching, ultra detailed" }
};

async function picBuffer(profile, id) {
	const picture = profile && profile.profilePicture;
	if (!picture) return null;
	const hd = await hdProfilePicture(String(profile.userID || id), [picture]).catch(() => null);
	if (hd && hd.buffer) return hd;
	const got = await axios.get(picture, { responseType: "arraybuffer", timeout: 30000, headers: { "User-Agent": "Mozilla/5.0" } });
	return { buffer: Buffer.from(got.data), ext: "jpg" };
}

function build(n) {
	const style = STYLES[n];
	return {
		config: {
			name: `slap${n}`,
			version: "1.0",
			author: "CRX Shihab",
			countDown: 30,
			role: 0,
			description: { en: `${style.title}: slap someone, picture made with Midjourney from both profile pictures` },
			category: "image",
			guide: { en: `Reply to someone's message with {pn}\nOr: {pn} @user\nStyles: slap1 .. slap5` }
		},

		onStart: async function ({ api, event, args, message }) {
			const react = emoji => Promise.resolve(api.setMessageReaction(emoji, event.messageID)).catch(() => { });
			let victim = null, victimProfile = null, meProfile = null;
			try {
				victim = await resolveUserTarget(args, event, api);
				victimProfile = await resolveProfile(args, event, api);
				meProfile = await resolveProfile([String(event.senderID)], Object.assign({}, event, { messageReply: null }), api);
			}
			catch (_) { /* handled below */ }
			if (!victim || !victim.id) return message.reply("❌ Kake slap marbe? Kono message e reply diye likho, ba @user dao.");
			if (String(victim.id) === String(event.senderID)) return message.reply("😅 Nijeke nijei slap? Onno kono manusher message e reply dao.");

			await react("⏳");
			const wait = await message.reply(`👋 ${style.title} toiri hocche, ektu somoy lagbe...`).catch(() => null);
			const clearWait = async () => { if (wait && wait.messageID) { try { await api.unsendMessage(wait.messageID); } catch (_) { /* gone */ } } };
			try {
				const [a, b] = await Promise.all([picBuffer(meProfile, event.senderID), picBuffer(victimProfile, victim.id)]);
				if (!a || !b) throw new Error("ekjoner profile picture pawa jachhe na (private ba rate-limit hote pare)");
				const [urlA, urlB] = await Promise.all([uploadPublic(a.buffer, a.ext), uploadPublic(b.buffer, b.ext)]);
				const images = await tz.fetchImages("/api/image/mj", `${urlA} ${urlB} ${style.text} --iw 1.5`, { count: 1, random: false, timeout: 300000 });
				await clearWait();
				const nameA = (meProfile && (meProfile.name || meProfile.username)) || event.senderID;
				const nameB = (victimProfile && (victimProfile.name || victimProfile.username)) || victim.id;
				await message.reply({
					attachment: { buffer: images[0].buffer, fileName: `slap${n}.${images[0].ext}` },
					body: `👋 ${nameA} ➜ ${nameB} (${style.title})`, textFirst: true
				});
				await react("✅");
			}
			catch (e) {
				console.error(`[slap${n}] failed:`, (e && e.message) || e);
				await clearWait();
				await react("❌");
				return message.reply(`❌ Slap picture banano gelo na: ${((e && e.message) || "try again").toString().slice(0, 200)}`);
			}
		}
	};
}

module.exports = { build, STYLES };
