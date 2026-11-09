"use strict";

/**
 * gptimg — GPT image generation through the toshiro API.
 *   -gptimg <what to draw>
 */

const tz = require("../src/toshiro");

module.exports = {
	config: {
		name: "gptimg",
		aliases: ["gptimg2"],
		version: "1.0",
		author: "InstaBOT",
		countDown: 20,
		role: 0,
		category: "image",
		description: { en: "Make a picture with GPT Image 2" },
		guide: { en: "{pn} <what to draw>\nExample: {pn} a cat astronaut on the moon" }
	},

	onStart: async function ({ api, event, args, message, prefix, commandName }) {
		const prompt = args.join(" ").trim();
		if (!prompt) return message.reply(`🖼️ Ki ankbo bolo.\nExample: ${prefix || "-"}${commandName || "gptimg"} a cat astronaut on the moon`);

		const react = emoji => Promise.resolve(api.setMessageReaction(emoji, event.messageID)).catch(() => { });
		await react("⏳");
		try {
			const images = await tz.fetchImages("/api/image/gptimg2", prompt, { count: 1, random: false, timeout: 180000 });
			await message.reply({
				attachment: images.map((im, i) => ({ buffer: im.buffer, fileName: `gptimg${i + 1}.${im.ext}` }))
			});
			await react("✅");
		}
		catch (e) {
			console.error("[gptimg] failed:", (e && e.message) || e);
			await react("❌");
			return message.reply(`❌ Ankte parlam na: ${((e && e.message) || "try again").toString().slice(0, 200)}`);
		}
	}
};
