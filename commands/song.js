"use strict";

/**
 * song / sing / play / audio
 * Based on Tanvir Ahmed (Tanvir143)'s song command, adapted for IG2:
 *  - if the API really has searchMusic()/sendVoice() (ICA), they are used first;
 *  - otherwise (IG2 adapter: searchMusic is unsupported, sendVoice does not exist)
 *    it searches YouTube and sends the audio as an attachment.
 */

const axios = require("axios");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const { search, downloadAudio, removeLater } = require("../src/songDownload");

const MAX_SIZE = 25 * 1024 * 1024;
const ORDER = ["api", "ytdl", "yta2", "ytaudio"];

function getError(error) {
	return (error && error.response && error.response.data && error.response.data.message) ||
		(error && error.message) ||
		String(error);
}

function getFirstTrack(data) {
	if (!data) return null;
	if (Array.isArray(data)) return data[0] || null;
	if (typeof data !== "object") return null;
	for (const list of [data.tracks, data.results, data.songs, data.items, data.data]) {
		if (Array.isArray(list) && list.length) return list[0];
	}
	if (data.data && typeof data.data === "object") return getFirstTrack(data.data);
	return data;
}

function findAudioUrl(data) {
	if (!data) return null;
	const keys = ["progressive_download_url", "fast_start_progressive_download_url", "download_url", "downloadUrl",
		"audio_url", "audioUrl", "stream_url", "streamUrl", "url", "src", "link"];
	if (typeof data === "string") return /^https?:\/\//i.test(data) ? data : null;
	if (Array.isArray(data)) {
		for (const item of data) { const r = findAudioUrl(item); if (r) return r; }
		return null;
	}
	if (typeof data === "object") {
		for (const key of keys) {
			const v = data[key];
			if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
		}
		for (const v of Object.values(data)) {
			if (v && typeof v === "object") { const r = findAudioUrl(v); if (r) return r; }
		}
	}
	return null;
}

function isM4AUrl(url) {
	try { return new URL(url).pathname.toLowerCase().endsWith(".m4a"); }
	catch { return false; }
}

async function downloadM4A(url, filePath) {
	const response = await axios({
		method: "GET", url, responseType: "arraybuffer", timeout: 60000,
		maxContentLength: MAX_SIZE, maxBodyLength: MAX_SIZE,
		headers: { "User-Agent": "Mozilla/5.0" }
	});
	const buffer = Buffer.from(response.data);
	if (!buffer.length) throw new Error("Audio file is empty.");
	if (buffer.length > MAX_SIZE) throw new Error("Song file is larger than 25 MB.");
	if (buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp") throw new Error("Invalid M4A audio file.");
	await fs.writeFile(filePath, buffer);
	return filePath;
}

// Real ICA search exists only when the function is not the IG2 "unsupported" stub.
const hasIcaSearch = api => typeof api.searchMusic === "function" && !api.searchMusic._unsupported;
const hasIcaVoice = api => typeof api.sendVoice === "function";

module.exports = {
	config: {
		name: "song",
		aliases: ["play", "audio"],
		version: "9.1.0",
		author: "Tanvir Ahmed (Tanvir143)",
		countDown: 4,
		role: 0,
		category: "Users Cmd",
		description: { en: "Search and send the first available song." },
		guide: { en: "{pn} song name" }
	},

	onStart: async function ({ api, event, args, message }) {
		const query = args.join(" ").trim();
		const threadID = event.threadID;
		const tempDir = path.join(os.tmpdir(), "tanvir143-song");
		const cleanup = [];

		async function react(emoji) {
			try { await api.setMessageReaction(emoji, event.messageID, threadID); }
			catch (_) { /* reaction is optional */ }
		}

		try {
			if (!query) {
				return message.reply("🎵 | Please provide a song name.\nExample: song Believer");
			}
			void react("😘");

			let title = query, artist = "Unknown Artist", sendAudio;

			let done = false;
			if (hasIcaSearch(api) && hasIcaVoice(api)) {
				try {
					// ICA route (original Tanvir143 flow)
					const searchResult = await api.searchMusic(query);
					const track = getFirstTrack(searchResult);
					if (!track) throw new Error("No song found.");
					const audioUrl = findAudioUrl(track) || findAudioUrl(searchResult);
					if (!audioUrl) throw new Error("First song has no audio URL.");
					title = track.title || track.name || track.track_name || query;
					artist = track.artist || track.artists || track.author || track.singer || "Unknown Artist";

					let source;
					if (isM4AUrl(audioUrl)) source = { url: audioUrl };
					else {
						await fs.ensureDir(tempDir);
						const tempFile = path.join(tempDir, `tanvir143-${Date.now()}.m4a`);
						cleanup.push(tempFile);
						await downloadM4A(audioUrl, tempFile);
						source = { path: tempFile };
					}
					sendAudio = () => api.sendVoice({ ...source, threadId: threadID });
					done = true;
				}
				catch (e) {
					// IG2's adapter exposes searchMusic()/sendVoice() as unsupported stubs: use the YouTube route.
					if (!/not supported|UNSUPPORTED/i.test(`${e && e.code} ${e && e.message}`)) throw e;
				}
			}
			if (!done) {
				// IG2 route: YouTube search + audio attachment
				const results = await search(query, 3);
				if (!results || !results.length) throw new Error("No song found.");
				const video = results[0];
				title = video.title || query;
				artist = video.channel || "Unknown Artist";
				const file = await downloadAudio(video.url, ORDER);
				cleanup.push(file);
				sendAudio = () => message.reply({ attachment: fs.createReadStream(file) });
			}

			const infoText = `🎧 Song: ${title}\n🎤 Artist: ${artist}\n😘 Enjoy Using Tanvir143 Robot.`;

			// Send song and information at the same time
			const [audioResult, infoResult] = await Promise.allSettled([sendAudio(), message.reply(infoText)]);
			if (audioResult.status === "rejected") throw audioResult.reason;
			if (infoResult.status === "rejected") console.error("[TANVIR143 INFO ERROR]", getError(infoResult.reason));

			void react("✅");
		}
		catch (error) {
			console.error("[TANVIR143 SONG ERROR]", error);
			void react("❌");
			try {
				await message.reply(`❌ | Song failed.\n\n📝 | Error: ${getError(error)}`);
			}
			catch (replyError) { console.error("[TANVIR143 REPLY ERROR]", getError(replyError)); }
		}
		finally {
			for (const f of cleanup) { try { removeLater(f); } catch (_) { /* gone */ } }
		}
	}
};
