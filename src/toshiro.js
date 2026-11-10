"use strict";

/**
 * Helper for the image/search endpoints on the toshiro API host (pin, mj, ...).
 * The search word goes in a query parameter whose name is not documented, so the
 * common names are tried in turn and the one that works is remembered.
 */

const axios = require("axios");

const BASE = "https://toshiro-api-editz6t9.vercel.app";
const PARAMS = ["query", "q", "prompt", "text", "keyword", "search", "name", "input"];
const working = {};

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;
const IMG_HOST = /pinimg\.com|midjourney|discordapp|imgur|cloudinary|googleusercontent/i;
const NOT_IMAGE = /\.(mp4|webm|mov|m4v|mp3|m4a|aac|wav|ogg|json|html?)(\?|$)/i;
const isHttp = v => typeof v === "string" && /^https?:\/\//i.test(v);
const shuffle = list => list.slice().sort(() => Math.random() - 0.5);

function reasonOf(buffer, status) {
	let text = "";
	try {
		const j = JSON.parse(buffer.toString("utf8"));
		const r = j && j.result && typeof j.result === "object" ? j.result : {};
		const m = j.message || j.error || j.msg || r.message || r.error;
		text = m ? (typeof m === "object" ? JSON.stringify(m) : String(m)) : JSON.stringify(j);
	}
	catch (_) { text = buffer.toString("utf8"); }
	text = text.replace(/\s+/g, " ").trim().slice(0, 110);
	return status ? `HTTP ${status}${text ? ": " + text : ""}` : (text || "empty answer");
}

/** GET an endpoint with the search word; returns { buffer, type }. */
async function call(endpoint, query, timeout = 60000) {
	const names = working[endpoint] ? [working[endpoint]] : PARAMS;
	let reason = "no response";
	for (const name of names) {
		let res;
		try {
			res = await axios.get(BASE + endpoint, {
				params: { [name]: query }, responseType: "arraybuffer", timeout,
				maxContentLength: 40 * 1024 * 1024, validateStatus: () => true
			});
		}
		catch (e) { reason = `request failed: ${(e && e.message) || e}`; continue; }
		const buffer = Buffer.from(res.data);
		if (res.status >= 400) { reason = reasonOf(buffer, res.status); continue; }
		working[endpoint] = name;
		return { buffer, type: String(res.headers["content-type"] || "") };
	}
	throw new Error(reason);
}

// ---- finding the picture links in whatever the API answered ----

function urlsIn(v, out, loose, depth = 0) {
	if (!v || depth > 5) return out;
	if (typeof v === "string") {
		if (isHttp(v) && !NOT_IMAGE.test(v) && (loose || IMG_EXT.test(v) || IMG_HOST.test(v))) out.push(v);
	}
	else if (Array.isArray(v)) v.forEach(x => urlsIn(x, out, loose, depth + 1));
	else if (typeof v === "object") Object.values(v).forEach(x => urlsIn(x, out, loose, depth + 1));
	return out;
}

/** Bigger pinterest sizes win: originals > 736x > 474x > 236x. */
function score(u) {
	if (/\/originals\//.test(u)) return 1000;
	const m = u.match(/\/(\d+)x\//);
	return m ? Number(m[1]) : 1;
}
const best = list => list.slice().sort((a, b) => score(b) - score(a))[0];

function longestList(data) {
	let top = [];
	const walk = (v, d) => {
		if (!v || d > 4) return;
		if (Array.isArray(v)) {
			if (v.length > top.length && (v.every(x => x && typeof x === "object") || v.every(isHttp))) top = v;
			v.slice(0, 3).forEach(x => walk(x, d + 1));
		}
		else if (typeof v === "object") Object.values(v).forEach(x => walk(x, d + 1));
	};
	walk(data, 0);
	return top;
}

/** One picture link per search result (or every picture of a single result). */
function imageUrls(data) {
	for (const loose of [false, true]) {
		const items = longestList(data);
		if (items.length > 1) {
			const urls = items.map(it => best(urlsIn(it, [], loose))).filter(Boolean);
			if (urls.length) return [...new Set(urls)];
		}
		const all = urlsIn(data, [], loose);
		if (all.length) return [...new Set(all)];
	}
	return [];
}

function extOf(buffer, type) {
	const hex = buffer.slice(0, 12).toString("hex");
	if (hex.startsWith("89504e47")) return "png";
	if (hex.startsWith("ffd8ff")) return "jpg";
	if (hex.startsWith("47494638")) return "gif";
	if (hex.startsWith("52494646") && hex.includes("57454250")) return "webp";
	if (/png/i.test(type)) return "png";
	if (/webp/i.test(type)) return "webp";
	if (/gif/i.test(type)) return "gif";
	return "jpg";
}

async function download(url) {
	const res = await axios.get(url, {
		responseType: "arraybuffer", timeout: 30000, maxContentLength: 15 * 1024 * 1024,
		headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*,*/*" }
	});
	const buffer = Buffer.from(res.data);
	if (buffer.length < 1000) throw new Error("image too small");
	return { buffer, ext: extOf(buffer, String(res.headers["content-type"] || "")) };
}

/**
 * Ask an endpoint for pictures. Returns up to `count` { buffer, ext }.
 * opts: count (default 1), random (shuffle the results), timeout (ms).
 */
async function fetchImages(endpoint, query, opts = {}) {
	const { count = 1, random = true, timeout = 60000 } = opts;
	const r = await call(endpoint, query, timeout);
	if (/^image\//i.test(r.type)) return [{ buffer: r.buffer, ext: extOf(r.buffer, r.type) }];

	let data;
	try { data = JSON.parse(r.buffer.toString("utf8")); }
	catch (_) { throw new Error(`unexpected answer: ${reasonOf(r.buffer, 0)}`); }

	let urls = imageUrls(data);
	if (!urls.length) throw new Error(`no picture in the answer (${reasonOf(r.buffer, 0)})`);
	if (random) urls = shuffle(urls);

	const out = [];
	let lastError;
	for (const url of urls.slice(0, count * 3)) {
		try { out.push(await download(url)); }
		catch (e) { lastError = e; }
		if (out.length >= count) break;
	}
	if (!out.length) throw new Error(`could not download the picture (${(lastError && lastError.message) || "failed"})`);
	return out;
}

module.exports = { fetchImages, shuffle };
