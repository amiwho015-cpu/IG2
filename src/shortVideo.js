"use strict";

/**
 * Short-clip helpers shared by the video commands. Downloads go through the same
 * autodl API the `autodl` command uses; every clip is cut to MAX_SECONDS (15s).
 */

const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const MAX_SECONDS = 15;
const MAX_BYTES = 40 * 1024 * 1024;
const AUTODL_API = "https://toshiro-api-editz6t9.vercel.app/api/downloader/alldl";
const AUTODL_API_BACKUP = "https://toshiro-api-editz6t9.vercel.app/api/downloader/alldlv2";
const SEARCH_API = "https://toshiro-api-editz6t9.vercel.app/api/search/tiksearch";
const ANI_API = "https://toshiro-api-editz6t9.vercel.app/api/search/ani";
const SEARCH_PARAMS = ["query", "q", "keyword", "keywords", "search", "text", "name"];
const LINKS_FILE = path.join(__dirname, "..", "assets", "album_links.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const shuffle = list => list.slice().sort(() => Math.random() - 0.5);

function findUrl(obj) {
	if (!obj) return null;
	if (typeof obj === "string") return /^https?:\/\//i.test(obj) ? obj : null;
	if (Array.isArray(obj)) { for (const item of obj) { const f = findUrl(item); if (f) return f; } return null; }
	if (typeof obj === "object") {
		const keys = ["download", "downloadUrl", "download_url", "downloadLink", "download_link", "high_quality", "highQuality",
			"video", "videoUrl", "video_url", "url", "originalVideoUrl", "original_video_url"];
		for (const k of keys) if (obj[k]) { const f = findUrl(obj[k]); if (f) return f; }
		if (Array.isArray(obj.formats)) { const v = obj.formats.find(x => x && x.url); if (v) return v.url; }
		for (const k of Object.keys(obj)) { const f = findUrl(obj[k]); if (f) return f; }
	}
	return null;
}

async function fetchFile(url) {
	let origin = "";
	try { origin = new URL(url).origin + "/"; } catch (_) { /* keep empty */ }
	let lastError;
	for (const referer of [...new Set([origin, "https://www.tiktok.com/", ""])]) {
		try {
			const headers = { "User-Agent": UA, Accept: "*/*" };
			if (referer) headers.Referer = referer;
			const res = await axios.get(url, { responseType: "arraybuffer", timeout: 60000, maxContentLength: MAX_BYTES, maxBodyLength: MAX_BYTES, headers });
			const buffer = Buffer.from(res.data);
			if (!buffer.length) throw new Error("empty video");
			return buffer;
		}
		catch (e) {
			lastError = e;
			const status = e && e.response && e.response.status;
			if (status && status !== 403 && status !== 401) break;
		}
	}
	throw new Error("download: " + ((lastError && lastError.message) || lastError));
}

function ffmpegBin() {
	try { const p = require("ffmpeg-static"); if (p) return p; } catch (_) { /* use system ffmpeg */ }
	return "ffmpeg";
}

function runFfmpeg(args) {
	return new Promise((resolve, reject) => {
		const child = spawn(ffmpegBin(), args, { stdio: "ignore" });
		const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("ffmpeg timeout")); }, 90000);
		child.on("error", e => { clearTimeout(timer); reject(e); });
		child.on("close", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)); });
	});
}

/** Cut a video down to its first `seconds` seconds. If ffmpeg fails, the original is returned. */
async function trimClip(buffer, seconds = MAX_SECONDS) {
	const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	const input = path.join(os.tmpdir(), `clip_in_${id}.mp4`);
	const output = path.join(os.tmpdir(), `clip_out_${id}.mp4`);
	try {
		fs.writeFileSync(input, buffer);
		try { await runFfmpeg(["-y", "-i", input, "-t", String(seconds), "-c", "copy", "-movflags", "+faststart", output]); }
		catch (_) { await runFfmpeg(["-y", "-i", input, "-t", String(seconds), "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-c:a", "aac", "-movflags", "+faststart", output]); }
		const out = fs.readFileSync(output);
		return out.length ? out : buffer;
	}
	catch (_) { return buffer; }
	finally {
		for (const f of [input, output]) { try { fs.unlinkSync(f); } catch (_) { /* ignore */ } }
	}
}

/** Short readable reason out of whatever the autodl API answered. */
function apiMessage(data, status) {
	let text = "";
	if (data == null || data === "") text = "empty response";
	else if (typeof data === "string") text = data;
	else {
		const r = data.result && typeof data.result === "object" ? data.result : {};
		const m = data.message || data.error || data.msg || r.message || r.error;
		text = m ? (typeof m === "object" ? JSON.stringify(m) : String(m)) : JSON.stringify(data);
	}
	text = text.replace(/\s+/g, " ").trim().slice(0, 100);
	return status ? `HTTP ${status}: ${text}` : text;
}

/** A YouTube link in a few shapes the API might prefer; other links are used as they are. */
function linkVariants(link) {
	const m = String(link).match(/(?:youtu\.be\/|[?&]v=|\/shorts\/)([\w-]{11})/);
	if (!m) return [link];
	return [`https://www.youtube.com/watch?v=${m[1]}`, `https://youtu.be/${m[1]}`];
}

/** Video link (TikTok, YouTube, ...) -> Buffer (cut to 15s), through the autodl API. */
async function autodlDownload(link, trim = true) {
	let reason = "no download link returned";
	for (const url of linkVariants(link)) {
		for (const api_url of [AUTODL_API, AUTODL_API_BACKUP]) {
			let res;
			try { res = await axios.get(`${api_url}?url=${encodeURIComponent(url)}`, { timeout: 60000, validateStatus: () => true }); }
			catch (e) { reason = `request failed: ${(e && e.message) || e}`; continue; }
			const direct = res.status < 400 ? findUrl(res.data) : null;
			if (direct) {
				try { const file = await fetchFile(direct); return trim ? await trimClip(file) : file; }
				catch (e) { reason = `download failed: ${(e && e.message) || e}`; continue; }
			}
			reason = apiMessage(res.data, res.status >= 400 ? res.status : 0);
		}
	}
	throw new Error(`autodl: ${reason}`);
}

// ---- search APIs on the same toshiro host autodl uses (tiksearch, ani) ----

const searchParams = {}; // endpoint -> the parameter name that worked once
const PAGE_RE = /tiktok\.com\/(@[^/]+\/video\/\d+|t\/)|vm\.tiktok\.com|vt\.tiktok\.com/i;
const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;
const isHttp = v => typeof v === "string" && /^https?:\/\//i.test(v);

/** The longest list in the response (of objects or links) = the search results. */
function pickItems(data) {
	let best = [];
	const walk = (v, depth) => {
		if (!v || depth > 4) return;
		if (Array.isArray(v)) {
			if (v.length > best.length && (v.every(x => x && typeof x === "object") || v.every(isHttp))) best = v;
			v.slice(0, 3).forEach(x => walk(x, depth + 1));
		}
		else if (typeof v === "object") Object.values(v).forEach(x => walk(x, depth + 1));
	};
	walk(data, 0);
	if (best.length) return best;
	// a single result instead of a list
	const one = data && typeof data === "object" ? (data.result || data.data || data) : null;
	return one && typeof one === "object" && !Array.isArray(one) ? [one] : [];
}

/** One search result -> { pageUrl, direct }: a page link for autodl and/or a direct file link. */
function toCandidate(item) {
	if (isHttp(item)) return PAGE_RE.test(item) ? { pageUrl: item, direct: null } : { pageUrl: null, direct: item };
	const pageKeys = ["url", "link", "video_url", "videoUrl", "share_url", "shareUrl", "web_video_url", "webVideoUrl", "tiktok_url", "tiktokUrl", "permalink"];
	let pageUrl = pageKeys.map(k => item[k]).find(v => typeof v === "string" && PAGE_RE.test(v)) || null;
	if (!pageUrl) {
		const a = item.author && typeof item.author === "object" ? item.author : {};
		const user = a.unique_id || a.uniqueId || a.username || item.unique_id || item.username;
		const id = item.id || item.video_id || item.videoId || item.aweme_id;
		if (user && id && /^\d+$/.test(String(id))) pageUrl = `https://www.tiktok.com/@${user}/video/${id}`;
	}
	const usable = v => isHttp(v) && !PAGE_RE.test(v) && !IMAGE_RE.test(v);
	let direct = null;
	for (const k of ["hdplay", "play", "nowm", "no_watermark", "wmplay", "play_url", "playUrl", "download", "downloadUrl", "download_url", "video", "videoUrl", "video_url", "url", "link"]) {
		if (usable(item[k])) { direct = item[k]; break; }
	}
	if (!direct && item.video && typeof item.video === "object") {
		const u = findUrl(item.video);
		if (usable(u)) direct = u;
	}
	if (!direct) direct = Object.values(item).find(v => usable(v) && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(v)) || null;
	return pageUrl || direct ? { pageUrl, direct } : null;
}

async function searchApi(endpoint, query, tag) {
	const names = searchParams[endpoint] ? [searchParams[endpoint]] : SEARCH_PARAMS;
	let reason = "no results";
	for (const name of names) {
		let res;
		try { res = await axios.get(endpoint, { params: { [name]: query }, timeout: 30000, validateStatus: () => true }); }
		catch (e) { reason = `request failed: ${(e && e.message) || e}`; continue; }
		if (res.status >= 400) { reason = apiMessage(res.data, res.status); continue; }
		const items = pickItems(res.data).map(toCandidate).filter(Boolean);
		if (items.length) { searchParams[endpoint] = name; return items; }
		reason = apiMessage(res.data, 0);
	}
	throw new Error(`${tag}: ${reason}`);
}

/** Search an API, download one result (page links go through autodl), cut to 15s. */
async function searchClip(endpoint, query, tag, trim = true) {
	const items = shuffle(await searchApi(endpoint, query, tag));
	let lastError = new Error(`${tag}: no playable video in the results`);
	for (const it of items.slice(0, 5)) {
		if (it.pageUrl) { try { return await autodlDownload(it.pageUrl, trim); } catch (e) { lastError = e; } }
		if (it.direct) { try { const file = await fetchFile(it.direct); return trim ? await trimClip(file) : file; } catch (e) { lastError = e; } }
	}
	throw lastError;
}

const tiktokClip = query => searchClip(SEARCH_API, query, "tiksearch");
/** Same search, but the whole video (no 15s cut) - used by the tiksearch command. */
const tiktokFull = query => searchClip(SEARCH_API, query, "tiksearch", false);
const aniClip = query => searchClip(ANI_API, query, "ani");

/** A random clip from the links you saved for `key` in assets/album_links.json. */
async function savedClip(key) {
	let links = [];
	try {
		const data = JSON.parse(fs.readFileSync(LINKS_FILE, "utf8"));
		links = Array.isArray(data && data[key]) ? data[key].filter(u => typeof u === "string" && /^https?:\/\//i.test(u)) : [];
	}
	catch (_) { /* no file */ }
	if (!links.length) throw new Error("no saved links");
	let lastError;
	for (const link of shuffle(links).slice(0, 4)) {
		try { return await autodlDownload(link); }
		catch (e) { lastError = e; }
	}
	throw lastError;
}

/** A YouTube clip (up to 15s) matching `query`, fetched through the autodl API. */
async function youtubeClip(query) {
	const yts = require("yt-search");
	const res = await yts(`${query} shorts`);
	// any clip, but not hour-long ones: the whole file is downloaded before it is trimmed
	const list = shuffle(((res && res.videos) || []).filter(v => v.seconds > 0 && v.seconds <= 180 && v.url));
	if (!list.length) throw new Error("no video found");
	let lastError;
	for (const v of list.slice(0, 4)) {
		try { return await autodlDownload(v.url); }
		catch (e) { lastError = e; }
	}
	throw lastError;
}

module.exports = { MAX_SECONDS, autodlDownload, trimClip, tiktokClip, tiktokFull, aniClip, savedClip, youtubeClip, shuffle };
