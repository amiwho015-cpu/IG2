"use strict";

/**
 * tiksearch — search TikTok and send a random matching video.
 *   -tiksearch <words>        e.g. -tiksearch funny cats
 * Uses https://toshiro-api-editz6t9.vercel.app/api/search/tiksearch; each result is
 * downloaded through the autodl API (alldl, then alldlv2 as backup).
 *
 * Author: Shihab
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const sv = require("../src/shortVideo");

module.exports = {
	config: {
		name: "tiksearch",
		aliases: ["tiktoksearch", "tts", "tiks"],
		version: "1.0",
		author: "Shihab",
		countDown: 10,
		role: 0,
		category: "media",
		shortDescription: { en: "Search TikTok and send a random video" },
		guide: { en: "{pn} <words> → random TikTok video about that\nExample: {pn} funny cats" }
	},

	onStart: async function ({ args, message }) {
		const query = args.join(" ").trim();
		if (!query) return message.reply("Ki search korbo? Example: -tiksearch funny cats 🙂");

		await message.reply(`🔎 TikTok e "${query}" khujchi...`).catch(() => { });
		let video;
		try { video = await sv.tiktokFull(query); }
		catch (error) { return message.reply(`❌ TikTok video pawa jayni: ${error.message}`); }

		const file = path.join(os.tmpdir(), `tiksearch_${Date.now()}.mp4`);
		fs.writeFileSync(file, video);
		try {
			await message.reply({ attachment: fs.createReadStream(file) });
		}
		catch (error) {
			await message.reply(`❌ Video pathate problem: ${error.message}`).catch(() => { });
		}
		finally {
			setTimeout(() => fs.unlink(file, () => { }), 30000).unref();
		}
	}
};
