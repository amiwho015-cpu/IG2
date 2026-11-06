"use strict";

const tz = require("../src/toshiro");

module.exports = {
	config: {
		name: "pin",
		aliases: ["pinterest"],
		version: "1.0",
		author: "CRX Shihab",
		countDown: 8,
		role: 0,
		description: { en: "Search pictures on Pinterest" },
		category: "image",
		guide: { en: "{pn} <search>   → 3 pictures\n{pn} <search> -n <1-6>   → that many pictures\nExample: {pn} anime boy -n 4" }
	},

	onStart: async function ({ api, event, args, message, prefix, commandName }) {
		let count = 3;
		const words = [];
		for (let i = 0; i < args.length; i++) {
			if (/^-n$/i.test(args[i]) && /^\d+$/.test(args[i + 1] || "")) { count = Math.min(6, Math.max(1, parseInt(args[++i], 10))); }
			else words.push(args[i]);
		}
		const query = words.join(" ").trim();
		if (!query) return message.reply(`📌 What should I search?\nExample: ${prefix || "-"}${commandName || "pin"} anime boy -n 4`);

		const react = emoji => Promise.resolve(api.setMessageReaction(emoji, event.messageID)).catch(() => { });
		await react("⏳");
		try {
			const images = await tz.fetchImages("/api/search/pin", query, { count });
			await message.reply({
				attachment: images.map((im, i) => ({ buffer: im.buffer, fileName: `pin${i + 1}.${im.ext}` }))
			});
			await react("✅");
		}
		catch (e) {
			console.error("[pin] failed:", (e && e.message) || e);
			await react("❌");
			return message.reply(`❌ Could not get pictures: ${((e && e.message) || "try again").toString().slice(0, 200)}`);
		}
	}
};
