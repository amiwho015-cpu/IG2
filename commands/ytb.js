"use strict";

/**
 * ytb — YouTube video/audio downloader.
 * Same engine as `sing` / `sing2` (src/songDownload.js): yt-search for the
 * search, API mirrors + direct ytdl for the download. No dead third-party API.
 *   ytb <name>        -> video list
 *   ytb -a <name>     -> audio list
 *   ytb <youtube link>        -> video directly
 *   ytb -a <youtube link>     -> audio directly
 */

const fs = require("fs");
const { search, downloadAudio, downloadVideo, removeLater } = require("../src/songDownload");

const YT_RE = /(https?:\/\/)?((www|m|music)\.)?(youtube\.com|youtu\.be)\/[^\s]+/i;
const PER_PAGE = 5;
const AUDIO_ORDER = ["api", "ytdl", "yta2", "ytaudio"];
const VIDEO_ORDER = ["api", "ytdl"];

const errText = e => ((e && e.message) || e || "").toString().slice(0, 200);

async function unsend(api, message, id) {
	if (!id) return;
	try { await api.unsendMessage(id); return; } catch (_) { /* try the other path */ }
	try { await message.unsend(id); } catch (_) { /* already gone */ }
}

async function sendMedia(api, message, { url, title, channel, mode }) {
	const wait = await message.reply(`⏳ Downloading ${mode === "audio" ? "audio" : "video"}${title ? `: ${title}` : "..."}`).catch(() => null);
	let file;
	try {
		file = mode === "audio" ? await downloadAudio(url, AUDIO_ORDER) : await downloadVideo(url, VIDEO_ORDER);
		const caption = title ? `${mode === "audio" ? "🎧" : "🎬"} ${title}${channel ? `\n📺 ${channel}` : ""}` : "";
		await message.reply({ body: caption, attachment: fs.createReadStream(file) });
	}
	catch (e) {
		await unsend(api, message, wait && wait.messageID);
		return message.reply(`❌ Download failed. (${errText(e)})`);
	}
	finally { if (file) removeLater(file); }
	await unsend(api, message, wait && wait.messageID);
}

function pageText(state) {
	const start = (state.page - 1) * PER_PAGE;
	const slice = state.results.slice(start, start + PER_PAGE);
	const lines = slice.map((v, i) => `${i + 1}. ${v.title}${v.duration ? `\n⏱ ${v.duration}` : ""}${v.channel ? `\n📺 ${v.channel}` : ""}`);
	return `🔎 "${state.query}" — ${state.mode.toUpperCase()}\n📄 Page ${state.page}/${state.totalPages}\n━━━━━━━━━━━━━━\n${lines.join("\n\n")}\n━━━━━━━━━━━━━━\n↩ Reply 1-${slice.length} to download, or "next" / "prev"`;
}

function sendPage(message, event, state) {
	return message.reply(pageText(state), (err, info) => {
		if (err || !info) return;
		global.GoatBot.onReply.set(info.messageID, {
			commandName: "ytb", messageID: info.messageID, author: event.senderID, state
		});
	});
}

module.exports = {
	config: {
		name: "ytb",
		aliases: ["youtube"],
		version: "11.0",
		author: "InstaBOT",
		countDown: 5,
		role: 0,
		category: "media",
		description: { en: "Search YouTube and send the video or audio" },
		guide: { en: "{pn} <name> → video list\n{pn} -a <name> → audio list\n{pn} <youtube link> → send video\n{pn} -a <youtube link> → send audio" }
	},

	onStart: async function ({ api, event, args, message }) {
		let mode = "video";
		const words = args.filter(w => {
			const f = w.toLowerCase();
			if (f === "-a") { mode = "audio"; return false; }
			if (f === "-v") { mode = "video"; return false; }
			return true;
		});
		const input = words.join(" ").trim();
		if (!input) return message.reply("🎬 YouTube downloader\n\nytb believer\nytb -a believer\nytb <youtube link>\nytb -a <youtube link>");

		if (YT_RE.test(input)) return sendMedia(api, message, { url: input.match(YT_RE)[0].replace(/^(?!https?:\/\/)/i, "https://"), mode });

		let results;
		try { results = await search(input, 15); }
		catch (e) { return message.reply(`❌ Search failed. (${errText(e)})`); }
		if (!results.length) return message.reply(`❌ No results for "${input}".`);

		const state = { results, mode, query: input, page: 1, totalPages: Math.ceil(results.length / PER_PAGE) };
		return sendPage(message, event, state);
	},

	onReply: async function ({ api, event, Reply, message }) {
		if (event.senderID !== Reply.author) return;
		const state = Reply.state;
		const text = String(event.body || "").trim().toLowerCase();

		// Handlers are one-shot, so every non-final answer arms a fresh list.
		const relist = async (page) => {
			state.page = page;
			await unsend(api, message, Reply.messageID);
			return sendPage(message, event, state);
		};

		if (text === "next" || text === "n") {
			if (state.page >= state.totalPages) { await message.reply("📄 This is the last page."); return sendPage(message, event, state); }
			return relist(state.page + 1);
		}
		if (text === "prev" || text === "p") {
			if (state.page <= 1) { await message.reply("📄 This is the first page."); return sendPage(message, event, state); }
			return relist(state.page - 1);
		}

		const n = parseInt(text);
		const start = (state.page - 1) * PER_PAGE;
		const count = Math.min(PER_PAGE, state.results.length - start);
		if (!Number.isInteger(n) || n < 1 || n > count) {
			await message.reply(`❌ Reply with 1-${count}, or "next" / "prev".`);
			return sendPage(message, event, state);
		}
		await unsend(api, message, Reply.messageID);   // auto-unsend the list
		const v = state.results[start + n - 1];
		return sendMedia(api, message, { url: v.url, title: v.title, channel: v.channel, mode: state.mode });
	}
};
