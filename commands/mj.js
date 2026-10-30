"use strict";

const tz = require("../src/toshiro");

module.exports = {
	config: {
		name: "mj",
		aliases: ["midjourney"],
		version: "1.0",
		author: "CRX Shihab",
		countDown: 30,
		role: 0,
		description: { en: "Make AI pictures with Midjourney" },
		category: "image",
		guide: { en: "{pn} <what to draw>\nExample: {pn} a lion wearing a golden crown, cinematic" }
	},

	onStart: async function ({ api, event, args, message, prefix, commandName }) {
		const prompt = args.join(" ").trim();
		if (!prompt) return message.reply(`🎨 Tell me what to draw.\nExample: ${prefix || "-"}${commandName || "mj"} a lion wearing a golden crown, cinematic`);

		const react = emoji => Promise.resolve(api.setMessageReaction(emoji, event.messageID)).catch(() => { });
		await react("⏳");
		const wait = await message.reply("🎨 Drawing with Midjourney, this can take a minute...").catch(() => null);
		const clearWait = async () => { if (wait && wait.messageID) { try { await api.unsendMessage(wait.messageID); } catch (_) { /* already gone */ } } };
		try {
			const images = await tz.fetchImages("/api/image/mj", prompt, { count: 4, random: false, timeout: 300000 });
			await clearWait();
			await message.reply({
				attachment: images.map((im, i) => ({ buffer: im.buffer, fileName: `mj${i + 1}.${im.ext}` }))
			});
			await react("✅");
		}
		catch (e) {
			console.error("[mj] failed:", (e && e.message) || e);
			await clearWait();
			await react("❌");
			return message.reply(`❌ Could not draw it: ${((e && e.message) || "try again").toString().slice(0, 200)}`);
		}
	}
};
