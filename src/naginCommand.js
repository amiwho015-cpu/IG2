"use strict";

/**
 * Shared code for the nagin1 .. nagin5 commands.
 * Reply to someone's message (or give @user / id): their profile picture is uploaded to a
 * temporary public host and sent to Midjourney as an IMAGE PROMPT together with a "Nagin" style
 * text, so the result is a nagin-themed picture inspired by that profile photo.
 * (Midjourney only uses the photo as a reference: the face will look similar, not identical.)
 */

const axios = require("axios");
const FormData = require("form-data");
const tz = require("./toshiro");
const { hdProfilePicture } = require("./hdpic");
const { resolveUserTarget, resolveProfile } = require("./utils");

const BASE = "mystical Indian Nagin, a divine half-woman half-cobra serpent goddess, the same person and face as the reference photo, ";
const STYLES = {
	1: { title: "Classic Nagin", text: BASE + "golden serpent jewellery, a giant glowing cobra hood fanned out behind her head, emerald scales on her arms, moonlit temple ruins, cinematic lighting, ultra detailed, 8k" },
	2: { title: "Dark Nagin", text: BASE + "jet-black cobra scales, glowing green snake eyes, dark cursed temple with mist, giant black king cobra coiled behind her, dramatic horror fantasy, ultra detailed, 8k" },
	3: { title: "Royal Bridal Nagin", text: BASE + "red and gold bridal lehenga, heavy kundan jewellery, a jewelled snake crown, a glowing Nagmani gem on her forehead, golden cobras around her, royal palace, cinematic, ultra detailed, 8k" },
	4: { title: "Forest Ichchadhari Nagin", text: BASE + "shape-shifting shapely serpent queen emerging from a dense magical forest at night, green and gold glow, cobra tail trailing behind her, fireflies, fantasy art, cinematic, ultra detailed, 8k" },
	5: { title: "Golden Warrior Nagin", text: BASE + "golden armour made of snake scales, a cobra-headed staff, a golden cobra hood behind her head, fire and lightning sky, epic warrior queen, cinematic, ultra detailed, 8k" }
};

async function uploadPublic(buffer, ext) {
	const hosts = [
		{ url: "https://litterbox.catbox.moe/resources/internals/api.php", extra: { reqtype: "fileupload", time: "1h" } },
		{ url: "https://catbox.moe/user/api.php", extra: { reqtype: "fileupload" } }
	];
	let last = "upload failed";
	for (const h of hosts) {
		try {
			const form = new FormData();
			for (const [k, v] of Object.entries(h.extra)) form.append(k, v);
			form.append("fileToUpload", buffer, { filename: `pfp.${ext || "jpg"}` });
			const res = await axios.post(h.url, form, {
				headers: { ...form.getHeaders(), "User-Agent": "Mozilla/5.0" },
				timeout: 60000, maxBodyLength: Infinity, validateStatus: () => true
			});
			const out = String(res.data || "").trim();
			if (/^https:\/\//i.test(out)) return out;
			last = `${h.url.split("/")[2]}: ${out.slice(0, 80) || "HTTP " + res.status}`;
		}
		catch (e) { last = `${h.url.split("/")[2]}: ${(e && e.message) || e}`; }
	}
	throw new Error(`could not upload the profile picture (${last})`);
}

function build(n) {
	const style = STYLES[n];
	return {
		config: {
			name: `nagin${n}`,
			version: "1.0",
			author: "CRX Shihab",
			countDown: 30,
			role: 0,
			description: { en: `Turn someone's profile picture into a ${style.title} (Midjourney)` },
			category: "image",
			guide: { en: `Reply to someone's message with {pn}\nOr: {pn} @user\nStyles: nagin1 .. nagin5` }
		},

		onStart: async function ({ api, event, args, message }) {
			const react = emoji => Promise.resolve(api.setMessageReaction(emoji, event.messageID)).catch(() => { });
			const targetArgs = (event.messageReply || (args && args.length)) ? args : [String(event.senderID)];

			let profile = null, target = null;
			try {
				target = await resolveUserTarget(targetArgs, event, api);
				profile = await resolveProfile(targetArgs, event, api);
			}
			catch (_) { /* handled below */ }
			if (!target || !target.id) return message.reply("❌ Kar nagin banabo? Kono message e reply diye likho, ba @user dao.");
			const picture = profile && profile.profilePicture;
			if (!picture) return message.reply("❌ Er profile picture pawa jachhe na (Instagram rate-limit ba private hote pare). Ektu pore try koro.");

			await react("⏳");
			const wait = await message.reply(`🐍 ${style.title} toiri hocche, ektu somoy lagbe...`).catch(() => null);
			const clearWait = async () => { if (wait && wait.messageID) { try { await api.unsendMessage(wait.messageID); } catch (_) { /* gone */ } } };
			try {
				const hd = await hdProfilePicture(String(profile.userID || target.id), [picture]).catch(() => null);
				let buffer, ext;
				if (hd && hd.buffer) { buffer = hd.buffer; ext = hd.ext; }
				else {
					const got = await axios.get(picture, { responseType: "arraybuffer", timeout: 30000, headers: { "User-Agent": "Mozilla/5.0" } });
					buffer = Buffer.from(got.data); ext = "jpg";
				}
				const imageUrl = await uploadPublic(buffer, ext);
				const prompt = `${imageUrl} ${style.text} --iw 1.5`;
				const images = await tz.fetchImages("/api/image/mj", prompt, { count: 1, random: false, timeout: 300000 });
				await clearWait();
				const name = (profile && (profile.name || profile.username)) || target.id;
				await message.reply({
					attachment: { buffer: images[0].buffer, fileName: `nagin${n}.${images[0].ext}` },
					body: `🐍 ${name} - ${style.title}`, textFirst: true
				});
				await react("✅");
			}
			catch (e) {
				console.error(`[nagin${n}] failed:`, (e && e.message) || e);
				await clearWait();
				await react("❌");
				return message.reply(`❌ Nagin banano gelo na: ${((e && e.message) || "try again").toString().slice(0, 200)}`);
			}
		}
	};
}

module.exports = { build, STYLES };
