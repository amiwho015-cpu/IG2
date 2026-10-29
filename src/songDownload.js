"use strict";

/**
 * Song search + audio download shared by `sing` and `sing2`.
 *   search : yt-search (scrapes YouTube, no API)
 *   "api"  : the public mirror list (shadowx-apis) -> /api/yt?type=mp3
 *   "ytdl" : @distube/ytdl-core straight from YouTube, converted to mp3 with ffmpeg
 *   "yta2" / "ytaudio": backup downloaders on the toshiro host (/downloader/yta2, /downloader/yt-audio)
 * `sing` tries api -> ytdl -> yta2 -> ytaudio, `sing2` tries ytdl -> api -> yta2 -> ytaudio,
 * so one going down is covered by the others.
 */

const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const APIS_JSON_URL = "https://raw.githubusercontent.com/eshitax/shadowx-apis/refs/heads/main/apis.json";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX_BYTES = 30 * 1024 * 1024;
const TOSHIRO = "https://toshiro-api-editz6t9.vercel.app/api/downloader";
const TOSHIRO_ENDPOINTS = { yta2: `${TOSHIRO}/yta2`, ytaudio: `${TOSHIRO}/yt-audio` };

async function search(query, limit = 8) {
	const yts = require("yt-search");
	const res = await yts(query);
	return ((res && res.videos) || []).slice(0, limit).map(v => ({
		title: v.title || "Unknown",
		url: v.url,
		duration: v.timestamp || "",
		channel: (v.author && v.author.name) || ""
	})).filter(v => v.url);
}

function tmpFile(ext) {
	return path.join(os.tmpdir(), `song_${Date.now()}_${Math.floor(Math.random() * 1e5)}.${ext}`);
}

async function saveStream(stream, file) {
	await new Promise((resolve, reject) => {
		const out = fs.createWriteStream(file);
		let size = 0;
		stream.on("data", chunk => {
			size += chunk.length;
			if (size > MAX_BYTES) { stream.destroy(new Error("file too large")); }
		});
		stream.on("error", reject);
		out.on("error", reject);
		out.on("finish", resolve);
		stream.pipe(out);
	});
	if (!fs.existsSync(file) || !fs.statSync(file).size) throw new Error("empty file");
}

async function apiBases() {
	const { data } = await axios.get(APIS_JSON_URL, { timeout: 10000 });
	let list = [];
	if (Array.isArray(data)) list = data;
	else if (data && typeof data === "object") {
		list = Array.isArray(data.apis) ? data.apis : Array.isArray(data.urls) ? data.urls : Array.isArray(data.api) ? data.api
			: Object.values(data).filter(v => typeof v === "string");
	}
	list = list.filter(u => typeof u === "string" && /^https?:\/\//.test(u)).map(u => u.replace(/\/+$/, ""));
	if (!list.length) throw new Error("no API mirrors available");
	return list;
}

function makeViaApi(type, quality, ext) {
	return async function (url) {
	let lastError = new Error("no API worked");
	for (const base of await apiBases()) {
		try {
			const { data } = await axios.get(`${base}/api/yt?url=${encodeURIComponent(url)}&type=${type}&quality=${quality}`, { timeout: 40000, headers: { "User-Agent": UA } });
			const link = data && data.success !== false && data.download && data.download.downloadUrl;
			if (!link) throw new Error("no download link");
			const res = await axios.get(link, { responseType: "stream", timeout: 120000, headers: { "User-Agent": UA } });
			const file = tmpFile(ext);
			await saveStream(res.data, file);
			return file;
		}
		catch (e) { lastError = e; }
	}
	throw lastError;
	};
}
const viaApi = makeViaApi("mp3", 128, "mp3");
const viaApiVideo = makeViaApi("mp4", 360, "mp4");

/** First downloadable link in an API answer (any shape: string, object, list). */
function findLink(obj, depth = 0) {
	if (!obj || depth > 6) return null;
	if (typeof obj === "string") return /^https?:\/\//i.test(obj) ? obj : null;
	if (Array.isArray(obj)) { for (const x of obj) { const f = findLink(x, depth + 1); if (f) return f; } return null; }
	if (typeof obj === "object") {
		const keys = ["download", "downloadUrl", "download_url", "downloadLink", "download_link", "audio", "audioUrl", "audio_url",
			"mp3", "link", "url", "result", "data"];
		for (const k of keys) if (obj[k]) { const f = findLink(obj[k], depth + 1); if (f) return f; }
		for (const k of Object.keys(obj)) { const f = findLink(obj[k], depth + 1); if (f) return f; }
	}
	return null;
}

/** Backup downloaders on the toshiro host (yta2, yt-audio): ?url=<youtube link> -> audio link. */
function viaToshiro(name) {
	return async function (url) {
		const { data } = await axios.get(`${TOSHIRO_ENDPOINTS[name]}?url=${encodeURIComponent(url)}`, { timeout: 40000, headers: { "User-Agent": UA } });
		const link = findLink(data);
		if (!link) throw new Error("no download link");
		const res = await axios.get(link, { responseType: "stream", timeout: 60000, headers: { "User-Agent": UA } });
		const file = tmpFile("mp3");
		await saveStream(res.data, file);
		return file;
	};
}

function toMp3(input) {
	return new Promise((resolve, reject) => {
		let ffmpeg;
		try { ffmpeg = require("ffmpeg-static"); } catch (_) { return reject(new Error("ffmpeg not installed")); }
		const output = tmpFile("mp3");
		const p = spawn(ffmpeg, ["-y", "-i", input, "-vn", "-b:a", "128k", output], { stdio: "ignore" });
		p.on("error", reject);
		p.on("close", code => (code === 0 && fs.existsSync(output) ? resolve(output) : reject(new Error("ffmpeg failed"))));
	});
}

async function viaYtdl(url) {
	const ytdl = require("@distube/ytdl-core");
	const raw = tmpFile("m4a");
	try {
		await saveStream(ytdl(url, { filter: "audioonly", quality: "highestaudio", highWaterMark: 1 << 25 }), raw);
		try { const mp3 = await toMp3(raw); return mp3; }
		catch (_) { return raw; }       // send the raw audio if conversion is not possible
	}
	finally { /* raw is removed by the caller only when it is the file that gets sent */ }
}

/** Direct YouTube video (audio+video in one mp4, <= 30 MB) via ytdl-core. */
async function viaYtdlVideo(url) {
	const ytdl = require("@distube/ytdl-core");
	const file = tmpFile("mp4");
	const filters = [
		{ quality: "18" },   // 360p mp4 with sound
		{ filter: f => f.hasVideo && f.hasAudio && f.container === "mp4", quality: "lowest" }
	];
	let lastError = new Error("no video format");
	for (const opt of filters) {
		try { await saveStream(ytdl(url, { ...opt, highWaterMark: 1 << 25 }), file); return file; }
		catch (e) { lastError = e; try { fs.unlinkSync(file); } catch (_) { /* nothing written */ } }
	}
	throw lastError;
}

/** Returns a file path to the video. order e.g. ["api","ytdl"]. */
async function downloadVideo(url, order = ["api", "ytdl"]) {
	const methods = { api: viaApiVideo, ytdl: viaYtdlVideo };
	const errors = [];
	for (const name of order) {
		try { return await methods[name](url); }
		catch (e) { errors.push(`${name}: ${(e && e.message) || e}`); }
	}
	throw new Error(errors.join(" | "));
}

/** Returns a file path to the audio. order e.g. ["api","ytdl"]. */
async function downloadAudio(url, order) {
	const methods = { api: viaApi, ytdl: viaYtdl, yta2: viaToshiro("yta2"), ytaudio: viaToshiro("ytaudio") };
	const errors = [];
	for (const name of order) {
		try { return await methods[name](url); }
		catch (e) { errors.push(`${name}: ${(e && e.message) || e}`); }
	}
	throw new Error(errors.join(" | "));
}

function removeLater(file, ms = 20000) {
	const t = setTimeout(() => fs.unlink(file, () => { }), ms);
	if (t.unref) t.unref();
}

module.exports = { search, downloadAudio, downloadVideo, removeLater };
