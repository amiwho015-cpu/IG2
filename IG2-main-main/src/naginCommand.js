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
	const e = ext || "jpg";
	const mime = e === "png" ? "image/png" : e === "webp" ? "image/webp" : "image/jpeg";
	const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
	const hosts = [
		{ name: "uguu.se", url: "https://uguu.se/upload", field: "files[]", extra: {}, parse: d => (d && d.files && d.files[0] && d.files[0].url) || "" },
		{ name: "tmpfiles.org", url: "https://tmpfiles.org/api/v1/upload", field: "file", extra: {}, parse: d => { const u = d && d.data && d.data.url; return u ? String(u).replace("tmpfiles.org/", "tmpfiles.org/dl/").replace("http://", "https://") : ""; } },
		{ name: "litterbox", url: "https://litterbox.catbox.moe/resources/internals/api.php", field: "fileToUpload", extra: { reqtype: "fileupload", time: "1h" }, parse: d => String(d || "").trim() },
		{ name: "catbox", url: "https://catbox.moe/user/api.php", field: "fileToUpload", extra: { reqtype: "fileupload" }, parse: d => String(d || "").trim() },
		{ name: "0x0.st", url: "https://0x0.st", field: "file", extra: {}, parse: d => String(d || "").trim() }
	];
	const errors = [];
	for (const h of hosts) {
		try {
			const form = new FormData();
			for (const [k, v] of Object.entries(h.extra)) form.append(k, v);
			form.append(h.field, buffer, { filename: `pfp.${e}`, contentType: mime });
			const res = await axios.post(h.url, form, {
				headers: { ...form.getHeaders(), "User-Agent": UA },
				timeout: 60000, maxBodyLength: Infinity, validateStatus: () => true
			});
			const out = h.parse(res.data);
			if (/^https:\/\//i.test(out)) return out;
			errors.push(`${h.name}: ${String(typeof res.data === "string" ? res.data : JSON.stringify(res.data || "")).slice(0, 40) || "HTTP " + res.status}`);
		}
		catch (err) { errors.push(`${h.name}: ${((err && err.message) || err).toString().slice(0, 40)}`); }
	}
	console.error("[nagin] all upload hosts failed:", errors.join(" | "));
	throw new Error(`could not upload the profile picture (${errors.join("; ")})`);
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

function buildAll() {
	return {
		config: {
			name: "nagin12345",
			aliases: ["naginall", "nagin12"],
			version: "1.0",
			author: "CRX Shihab",
			countDown: 60,
			role: 0,
			description: { en: "Make all 5 Nagin styles at once (Midjourney)" },
			category: "image",
			guide: { en: "Reply to someone's message with {pn}\nOr: {pn} @user" }
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
			const wait = await message.reply("🐍 5 ta Nagin (1-5) toiri hocche, ektu beshi somoy lagbe...").catch(() => null);
			const clearWait = async () => { if (wait && wait.messageID) { try { await api.unsendMessage(wait.messageID); } catch (_) { /* gone */ } } };
			const name = (profile && (profile.name || profile.username)) || target.id;
			try {
				const hd = await hdProfilePicture(String(profile.userID || target.id), [picture]).catch(() => null);
				let buffer, ext;
				if (hd && hd.buffer) { buffer = hd.buffer; ext = hd.ext; }
				else {
					const got = await axios.get(picture, { responseType: "arraybuffer", timeout: 30000, headers: { "User-Agent": "Mozilla/5.0" } });
					buffer = Buffer.from(got.data); ext = "jpg";
				}
				const imageUrl = await uploadPublic(buffer, ext);
				await clearWait();
				let ok = 0;
				await Promise.all([1, 2, 3, 4, 5].map(async n => {
					try {
						const images = await tz.fetchImages("/api/image/mj", `${imageUrl} ${STYLES[n].text} --iw 1.5`, { count: 1, random: false, timeout: 300000 });
						await message.reply({
							attachment: { buffer: images[0].buffer, fileName: `nagin${n}.${images[0].ext}` },
							body: `🐍 ${name} - ${STYLES[n].title} (${n}/5)`, textFirst: true
						});
						ok++;
					}
					catch (e) {
						console.error(`[nagin12345] style ${n} failed:`, (e && e.message) || e);
						await message.reply(`❌ nagin${n} (${STYLES[n].title}) hoyni: ${((e && e.message) || "try again").toString().slice(0, 120)}`).catch(() => { });
					}
				}));
				await react(ok ? "✅" : "❌");
			}
			catch (e) {
				console.error("[nagin12345] failed:", (e && e.message) || e);
				await clearWait();
				await react("❌");
				return message.reply(`❌ Nagin banano gelo na: ${((e && e.message) || "try again").toString().slice(0, 200)}`);
			}
		}
	};
}

module.exports = { build, buildAll, STYLES, uploadPublic };
