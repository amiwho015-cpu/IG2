"use strict";

/**
 * Video album — no private/owner API. Categories live in this file and each
 * one is just a set of search words; the video itself comes from TikTok's
 * public search through tikwm.com (no key, no account). To add a category,
 * add a line to CATEGORIES.
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const sv = require("../src/shortVideo");

const CATEGORIES = {
	anime: ["anime edit", "anime amv", "anime status"],
	cartoon: ["cartoon edit", "cartoon funny"],
	funny: ["funny video", "funny moments", "comedy shorts"],
	islamic: ["islamic video", "islamic status", "quran recitation"],
	sad: ["sad status", "sad edit", "sad video"],
	love: ["love status", "love edit", "romantic video"],
	couple: ["couple goals", "couple video", "cute couple"],
	attitude: ["attitude status", "attitude edit", "boy attitude"],
	baby: ["cute baby", "baby funny", "baby video"],
	cat: ["cute cat", "cat funny"],
	dog: ["cute dog", "dog funny"],
	lofi: ["lofi", "lofi edit", "lofi vibes"],
	football: ["football skills", "football edit", "football goals"],
	cricket: ["cricket highlights", "cricket edit"],
	gaming: ["gaming montage", "gaming clips", "free fire"],
	car: ["car edit", "supercar", "drift"],
	nature: ["nature video", "rain video", "mountain view"],
	motivation: ["motivation", "motivational status", "success mindset"],
	friendship: ["friendship status", "best friends video"],
	bangla: ["bangla status", "bangla song edit", "bangla funny"],
	hindi: ["hindi status", "hindi song edit"],
	english: ["english song edit", "english lyrics status"],
	song: ["song lyrics status", "song edit", "music video short"],
	dance: ["dance video", "dance challenge"],
	football2: ["ronaldo edit", "messi edit", "neymar skills"],
	sigma: ["sigma edit", "sigma status"],
	aesthetic: ["aesthetic video", "aesthetic edit"],
	travel: ["travel video", "travel vlog short"],
	food: ["street food", "food video", "cooking short"],
	magic: ["magic trick", "magic video"]
};
const NAMES = Object.keys(CATEGORIES).map(n => (n === "football2" ? "players" : n));
const KEYS = Object.keys(CATEGORIES);
const PER_PAGE = 10;
const MAX_BYTES = 40 * 1024 * 1024;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HOSTS = ["https://www.tikwm.com", "https://tikwm.com"];

function pageText(page, totalPages, prefix) {
	const start = (page - 1) * PER_PAGE;
	const lines = NAMES.slice(start, start + PER_PAGE).map((n, i) => `${start + i + 1}. ${n}`);
	return `🎞 ALBUM VIDEOS\n━━━━━━━━━━━━━━\n${lines.join("\n")}\n━━━━━━━━━━━━━━\n📄 Page ${page}/${totalPages}\n` +
		`↩ Reply with a number to get a video\n` +
		(page < totalPages ? `➡ ${prefix}album ${page + 1} → next page\n` : "") +
		`✍ ${prefix}album <name> → random video from that category`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const errMsg = e => (e && e.message) || String(e);

async function searchOnce(host, query) {
	const res = await axios.post(`${host}/api/feed/search`,
		new URLSearchParams({ keywords: query, count: "20", cursor: String(Math.random() < 0.5 ? 0 : 20), web: "1", hd: "1" }).toString(),
		{
			timeout: 25000,
			headers: {
				"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
				Accept: "application/json, text/javascript, */*; q=0.01",
				Origin: host, Referer: host + "/", "X-Requested-With": "XMLHttpRequest"
			}
		});
	return res.data;
}

async function searchVideos(query) {
	let lastError;
	for (const host of HOSTS) {
		// The free API allows about one request per second: wait and retry once.
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const data = await searchOnce(host, query);
				const videos = data && data.data && data.data.videos;
				if (Array.isArray(videos) && videos.length) {
					return videos.map(v => {
						let url = v.play || v.hdplay || v.wmplay || "";
						if (url.startsWith("/")) url = host + url;
						return { url, alt: [v.hdplay, v.wmplay].filter(Boolean).map(u => (u.startsWith("/") ? host + u : u)), duration: Number(v.duration) || 0, title: v.title || "" };
					}).filter(v => v.url);
				}
				const note = data && data.msg ? String(data.msg) : "no videos returned";
				lastError = new Error(note);
				if (/limit|second|frequen/i.test(note) && attempt === 0) { await sleep(1500); continue; }
				break;
			}
			catch (e) { lastError = e; break; }
		}
	}
	throw new Error("search: " + errMsg(lastError || "search failed"));
}

async function download(url) {
	// tikwm's own media links want tikwm as the referer; TikTok's CDN wants
	// tiktok.com. A 403 with one usually clears with the other (or none).
	let origin = "";
	try { origin = new URL(url).origin + "/"; } catch (_) { /* keep empty */ }
	const referers = [...new Set([origin, "https://www.tiktok.com/", "https://www.tikwm.com/", ""])];
	let lastError;
	for (const referer of referers) {
		try {
			const headers = { "User-Agent": UA, Accept: "*/*" };
			if (referer) headers.Referer = referer;
			const res = await axios.get(url, {
				responseType: "arraybuffer", timeout: 60000, maxContentLength: MAX_BYTES, maxBodyLength: MAX_BYTES, headers
			});
			const buffer = Buffer.from(res.data);
			if (!buffer.length) throw new Error("empty video");
			return buffer;
		}
		catch (e) {
			lastError = e;
			const status = e && e.response && e.response.status;
			if (status && status !== 403 && status !== 401) break; // not a referer problem
		}
	}
	throw new Error("download: " + errMsg(lastError));
}

async function sendFromTikTok(message, key, label) {
	const queries = CATEGORIES[key].slice().sort(() => Math.random() - 0.5);
	let videos;
	let searchError;
	for (const query of queries.slice(0, 2)) {
		try { videos = await searchVideos(query); break; }
		catch (e) { searchError = e; await sleep(1200); }
	}
	if (!videos) throw searchError || new Error("search failed");
	// short clips first: they fit Instagram's size limit without recompression
	// any clip works (it gets cut to 15s); skip very long ones to keep downloads small
	const usable = videos.filter(v => !v.duration || v.duration <= 180);
	const order = (usable.length ? usable : videos).slice().sort(() => Math.random() - 0.5);
	let lastError;
	for (const v of order.slice(0, 6)) {
		for (const url of [v.url, ...(v.alt || [])].slice(0, 2)) {
			try {
				const buffer = await sv.trimClip(await download(url));
				return await message.reply({
					attachment: { buffer, fileName: "album.mp4" }
				});
			}
			catch (e) { lastError = e; }
		}
	}
	throw lastError || new Error("could not download a video");
}

/** Collect a stream into a Buffer, aborting when it grows past `max` bytes. */
function streamToBuffer(stream, max) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		stream.on("data", c => {
			size += c.length;
			if (size > max) return stream.destroy(new Error("video too large"));
			chunks.push(c);
		});
		stream.on("error", reject);
		stream.on("end", () => (size ? resolve(Buffer.concat(chunks)) : reject(new Error("empty video"))));
	});
}

// autodl API + saved links + YouTube clips live in src/shortVideo.js (shared with anisearch).
const fromSavedLinks = key => sv.savedClip(key);
const youtubeVideo = key => sv.youtubeClip(CATEGORIES[key][Math.floor(Math.random() * CATEGORIES[key].length)]);

async function sendRandom(message, key, label) {
	const send = buffer => message.reply({ attachment: { buffer, fileName: "album.mp4" } });
	const errors = [];
	// 1) your saved TikTok links   2) TikTok search API (+autodl)   3) tikwm search   4) YouTube clips
	try { return await send(await fromSavedLinks(key)); }
	catch (e) { errors.push(`links: ${errMsg(e)}`); }
	try { return await send(await sv.tiktokClip(CATEGORIES[key][Math.floor(Math.random() * CATEGORIES[key].length)])); }
	catch (e) { errors.push(errMsg(e)); }
	try { return await sendFromTikTok(message, key, label); }
	catch (e) { errors.push(errMsg(e)); }
	try { return await send(await youtubeVideo(key)); }
	catch (e) { errors.push(`youtube: ${errMsg(e)}`); }
	throw new Error(errors.join(" | "));
}

module.exports = {
	config: {
		name: "album",
		aliases: ["gallery", "alb"],
		version: "14.0",
		author: "CRX Shihab",
		countDown: 10,
		role: 0,
		category: "media",
		description: { en: "Random video albums by category (cut to 15s)" },
		guide: { en: "{pn} [page] | {pn} <category>" }
	},

	onStart: async function ({ event, args, message, config }) {
		const prefix = (config && config.prefix) || "-";
		const totalPages = Math.ceil(NAMES.length / PER_PAGE);
		const arg = (args[0] || "").toLowerCase();

		if (arg && !/^\d+$/.test(arg)) {
			let idx = NAMES.indexOf(arg);
			if (idx < 0) idx = NAMES.findIndex(n => n.startsWith(arg));
			if (idx < 0) return message.reply(`❌ Category "${arg}" not found. Type ${prefix}album to see the list.`);
			try { return await sendRandom(message, KEYS[idx], NAMES[idx]); }
			catch (e) { return message.reply(`❌ Could not get a video: ${(e && e.message) || e}`); }
		}

		const page = Math.min(Math.max(parseInt(arg) || 1, 1), totalPages);
		return message.reply(pageText(page, totalPages, prefix), (err, info) => {
			if (err || !info) return;
			global.GoatBot.onReply.set(info.messageID, { commandName: "album", author: event.senderID, messageID: info.messageID });
		});
	},

	onReply: async function ({ event, Reply, message }) {
		if (event.senderID !== Reply.author) return;
		const n = parseInt(String(event.body || "").trim());
		if (!Number.isInteger(n) || n < 1 || n > NAMES.length) return message.reply("❌ Invalid selection.");
		try { await message.unsend(Reply.messageID); } catch (_) { /* already gone */ }
		try { return await sendRandom(message, KEYS[n - 1], NAMES[n - 1]); }
		catch (e) { return message.reply(`❌ Could not get a video: ${(e && e.message) || e}`); }
	}
};
