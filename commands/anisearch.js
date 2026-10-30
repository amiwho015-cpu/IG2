"use strict";

/**
 * anisearch — anime video search. No Xalman/private API: the clips come from
 * TikTok's public search through tikwm.com (no key needed).
 */

const axios = require("axios");
const sv = require("../src/shortVideo");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HOSTS = ["https://www.tikwm.com", "https://tikwm.com"];
const MAX_BYTES = 40 * 1024 * 1024;
const MAX_ATTEMPTS = 4;

async function searchVideos(query) {
	let lastError;
	for (const host of HOSTS) {
		for (let attempt = 1; attempt <= 2; attempt++) {
			try {
				const res = await axios.post(`${host}/api/feed/search`,
					new URLSearchParams({ keywords: `${query} anime edit`, count: "20", cursor: "0", web: "1", hd: "1" }).toString(),
					{ timeout: 25000, headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" } });
				const videos = (res.data && res.data.data && res.data.data.videos) || [];
				const items = videos.map(v => {
					let url = v.play || v.hdplay || v.wmplay || "";
					if (url.startsWith("/")) url = host + url;
					return { url, duration: Number(v.duration) || 0 };
				}).filter(v => v.url);
				if (items.length) {
					// any clip works (it gets cut to 15s later); skip very long ones to keep downloads small
					const usable = items.filter(v => !v.duration || v.duration <= 180);
					return (usable.length ? usable : items).map(v => v.url);
				}
				lastError = new Error("no videos returned");
				break;
			}
			catch (e) {
				lastError = e;
				if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
			}
		}
	}
	throw lastError || new Error("search failed");
}

// Download the clip and give it an .mp4 name so Instagram sends it as a VIDEO.
async function getVideo(url) {
	const res = await axios.get(url, {
		responseType: "arraybuffer",
		timeout: 60000,
		maxContentLength: MAX_BYTES,
		maxBodyLength: MAX_BYTES,
		headers: { "User-Agent": UA, "Referer": "https://www.tiktok.com/" }
	});
	const buffer = Buffer.from(res.data);
	if (!buffer.length) throw new Error("empty video");
	return { buffer: await sv.trimClip(buffer), fileName: "anisearch.mp4" };
}

async function fromTikTok(query) {
	const urls = sv.shuffle(await searchVideos(query));
	let lastError;
	for (const url of urls.slice(0, MAX_ATTEMPTS)) {
		try { return await getVideo(url); }
		catch (e) { lastError = e; }
	}
	throw lastError || new Error("could not download a video");
}

/** 1) ani search API  2) TikTok search API (+autodl)  3) tikwm search  4) YouTube clip  5) your saved "anime" links. */
async function findClip(query) {
	const errors = [];
	const wrap = buffer => ({ buffer, fileName: "anisearch.mp4" });
	try { return wrap(await sv.aniClip(query)); }
	catch (e) { errors.push((e && e.message) || String(e)); }
	try { return wrap(await sv.tiktokClip(`${query} anime edit`)); }
	catch (e) { errors.push((e && e.message) || String(e)); }
	try { return await fromTikTok(query); }
	catch (e) { errors.push(`tikwm: ${(e && e.message) || e}`); }
	try { return wrap(await sv.youtubeClip(`${query} anime edit`)); }
	catch (e) { errors.push(`youtube: ${(e && e.message) || e}`); }
	try { return wrap(await sv.savedClip("anime")); }
	catch (e) { errors.push(`links: ${(e && e.message) || e}`); }
	throw new Error(errors.join(" | "));
}

module.exports = {
	config: {
		name: "anisearch",
		aliases: ["amv", "animesearch"],
		version: "6.0",
		author: "xalman",
		countDown: 3,
		role: 0,
		description: "Search and get anime videos (cut to 15s)",
		category: "ANIME",
		guide: "{pn} <anime name>"
	},

	onStart: async function ({ api, event, message, args }) {
		const { messageID } = event;
		const react = emoji => Promise.resolve(api.setMessageReaction(emoji, messageID)).catch(() => {});

		const query = args.join(" ").trim();
		if (!query) return message.reply("❌ Please provide an anime name to search.");

		await react("⏳");

		let video;
		try { video = await findClip(query); }
		catch (e) {
			console.log("[anisearch] failed:", e && (e.message || e));
			await react("❌");
			return message.reply(`❌ Could not get a video: ${(e && e.message) || "try again"}`);
		}

		await message.reply("🎬 𝗔𝗡𝗜𝗠𝗘 𝗦𝗘𝗔𝗥𝗖𝗛 𝗥𝗘𝗦𝗨𝗟𝗧\n━━━━━━━━━━━━━━━━━━");
		await message.reply({ attachment: video });
		await react("✅");
	}
};
