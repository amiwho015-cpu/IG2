"use strict";

/**
 * Pick the sharpest profile picture from several candidate URLs.
 * Every candidate is downloaded, its real pixel size is read from the image
 * header, and the biggest one wins. Candidates that fail are skipped.
 */



const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const MAX_BYTES = Math.max(256 * 1024, Number(process.env.IG_MAX_MEDIA_BYTES) || 40 * 1024 * 1024);

/** { width, height } for JPEG / PNG / WebP buffers, or null. */
function imageSize(buf) {
	try {
		if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) // PNG
			return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
		if (buf[0] === 0xff && buf[1] === 0xd8) { // JPEG: walk to a SOF marker
			let i = 2;
			while (i + 9 < buf.length) {
				if (buf[i] !== 0xff) { i++; continue; }
				const marker = buf[i + 1];
				if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
					return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
				i += 2 + buf.readUInt16BE(i + 2);
			}
		}
		if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
			const kind = buf.toString("ascii", 12, 16);
			if (kind === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
			if (kind === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
		}
	}
	catch (_) { /* unreadable header */ }
	return null;
}

/** Same picture without Instagram's size segment (…/s150x150/… or stp=…_s150x150). */
function upsizedVariants(url) {
	const out = [];
	if (/\/s\d+x\d+\//.test(url)) out.push(url.replace(/\/s\d+x\d+\//, "/"));
	if (/[?&]stp=[^&]*s\d+x\d+/.test(url)) {
		out.push(url.replace(/([?&])stp=[^&]*(&|$)/, (m, a, b) => (b ? a : "")));
		// Also ask for bigger fixed sizes (works for some CDN links; the others just fail and are skipped).
		for (const size of [1080, 720, 640]) out.push(url.replace(/s\d+x\d+/, `s${size}x${size}`));
	}
	return out;
}

async function fetchImage(url) {
	const axios = require("axios");
	const res = await axios.get(url, {
		responseType: "arraybuffer", timeout: 15000, maxContentLength: MAX_BYTES,
		headers: { "User-Agent": UA, Accept: "image/*,*/*" }
	});
	const buffer = Buffer.from(res.data);
	if (!buffer.length) throw new Error("empty image");
	const size = imageSize(buffer) || { width: 0, height: 0 };
	return { url, buffer, width: size.width, height: size.height, type: String(res.headers["content-type"] || "") };
}

/**
 * @param {string[]} urls candidate picture URLs (best guess first)
 * @returns {Promise<{buffer, width, height, url, ext}|null>}
 */
async function bestPicture(urls) {
	const list = [];
	for (const u of urls.filter(Boolean)) {
		if (!list.includes(u)) list.push(u);
		for (const v of upsizedVariants(u)) if (!list.includes(v)) list.push(v);
	}
	const settled = await Promise.allSettled(list.slice(0, 8).map(fetchImage));
	const images = settled.filter(r => r.status === "fulfilled" && /image/i.test(r.value.type || "image")).map(r => r.value);
	if (!images.length) return null;
	images.sort((a, b) => (b.width * b.height) - (a.width * a.height) || b.buffer.length - a.buffer.length);
	const best = images[0];
	const ext = /png/i.test(best.type) ? "png" : /webp/i.test(best.type) ? "webp" : "jpg";
	return { buffer: best.buffer, width: best.width, height: best.height, url: best.url, ext };
}

/** The bot's own Instagram cookies (list of {key,value}); empty when none. */
function botCookies() {
	try { return require("./config").loadAccount(); }
	catch (_) { return []; }
}
function botCookieHeader() {
	const keep = ["sessionid", "ds_user_id", "csrftoken", "mid", "ig_did", "ig_nrcb", "datr"];
	return botCookies().filter(c => keep.includes(c.key)).map(c => `${c.key}=${c.value}`).join("; ");
}
const cookieValue = name => { const c = botCookies().find(x => x.key === name); return c ? c.value : ""; };

// ---- Instagram calls: spaced out + per-endpoint cooldown ---------------------
// A group card asks for dozens of pictures at once. Firing them together makes Instagram answer
// 429 and every picture falls back to the tiny thumbnail. So calls go through ONE queue with a
// gap between them, and an endpoint that answered 429 is left alone for a while.
const IG_APP_ID = "936619743392459";
const MOBILE_UA = "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)";
const blockedUntil = {};
let lastCall = 0;
let queue = Promise.resolve();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cooldownLeft = key => Math.max(0, (blockedUntil[key] || 0) - Date.now());

function spaced() {
	const turn = queue.then(async () => {
		const wait = lastCall + 700 + Math.floor(Math.random() * 500) - Date.now();
		if (wait > 0) await sleep(wait);
		lastCall = Date.now();
	});
	queue = turn.catch(() => { });
	return turn;
}

async function getJSON(url, headers, key) {
	if (cooldownLeft(key) > 0) return null;
	await spaced();
	try {
		const res = await require("axios").get(url, { headers, timeout: 15000 });
		return res.data;
	}
	catch (error) {
		const status = error.response && error.response.status;
		if (status === 429) {
			const retry = Number(error.response.headers && error.response.headers["retry-after"]);
			blockedUntil[key] = Date.now() + (retry > 0 ? Math.min(retry, 900) * 1000 : 3 * 60 * 1000);
		}
		try { require("./logger").warn("HDPIC", `${key} lookup failed: ${status || error.code || error.message}`); } catch (_) { /* log optional */ }
		return null;
	}
}

let resolver = null;
/** bot.js hands in api.getHdPictureUrls so lookups can also use the bot's own session. */
function setResolver(fn) { resolver = typeof fn === "function" ? fn : null; }

function urlsFromUser(u) {
	if (!u) return [];
	const versions = Array.isArray(u.hd_profile_pic_versions) ? u.hd_profile_pic_versions : [];
	return [
		u.hd_profile_pic_url_info && u.hd_profile_pic_url_info.url,
		...versions.slice().sort((a, b) => (b.width || 0) - (a.width || 0)).map(v => v && v.url),
		u.profile_pic_url_hd
	].filter(Boolean);
}

/**
 * Best (HD) profile picture for a user id. Order: private mobile endpoint -> private web
 * endpoint (both need the bot's cookies; same calls the working Insta-Bot3 uses) -> the bot's
 * own session -> any URLs we already have. The sharpest download wins.
 */
async function hdProfilePictureRaw(userID, fallbackUrls = []) {
	const candidates = [];
	const cookie = botCookieHeader();
	if (userID && cookie.includes("sessionid=")) {
		const mobile = { "User-Agent": MOBILE_UA, "X-IG-App-ID": IG_APP_ID, Accept: "*/*", Cookie: cookie };
		const web = {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
			"X-IG-App-ID": IG_APP_ID, Accept: "*/*", Cookie: cookie, "X-CSRFToken": cookieValue("csrftoken")
		};
		let data = await getJSON(`https://i.instagram.com/api/v1/users/${userID}/info/`, mobile, "private");
		candidates.push(...urlsFromUser(data && data.user));
		if (!candidates.length) {
			data = await getJSON(`https://www.instagram.com/api/v1/users/${userID}/info/`, web, "private-web");
			candidates.push(...urlsFromUser(data && data.user));
		}
	}
	if (!candidates.length && resolver && userID) {
		try { candidates.push(...await resolver(String(userID))); }
		catch (error) { try { require("./logger").warn("HDPIC", `session lookup failed for ${userID}: ${(error && error.message) || error}`); } catch (_) { /* log optional */ } }
	}
	return bestPicture([...candidates, ...fallbackUrls]);
}

// ---- disk cache ----------------------------------------------------------
// A good (>=500px) picture is kept on disk, so asking again never touches Instagram's API and
// a later 429 cannot turn a sharp picture into a blurry one. Survives restarts.
const fs = require("fs");
const path = require("path");
const CACHE_DIR = path.join(__dirname, "..", "data", "hd-cache");
const DISK_TTL = 12 * 60 * 60 * 1000;

function readDisk(id) {
	try {
		const meta = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `${id}.json`), "utf8"));
		const buffer = fs.readFileSync(path.join(CACHE_DIR, `${id}.${meta.ext}`));
		return Object.assign({}, meta, { buffer });
	}
	catch (_) { return null; }
}
function writeDisk(id, value) {
	try {
		fs.mkdirSync(CACHE_DIR, { recursive: true });
		fs.writeFileSync(path.join(CACHE_DIR, `${id}.${value.ext}`), value.buffer);
		fs.writeFileSync(path.join(CACHE_DIR, `${id}.json`), JSON.stringify({ at: Date.now(), ext: value.ext, width: value.width, height: value.height, url: value.url }));
	}
	catch (_) { /* cache is optional */ }
}

// ---- memory cache + concurrency ------------------------------------------------
const CACHE = new Map();
const HD_TTL = 6 * 60 * 60 * 1000, LOW_TTL = 10 * 60 * 1000, MAX_CACHE = 600;
let running = 0;
const waiting = [];
const acquire = () => new Promise(resolve => { if (running < 4) { running++; resolve(); } else waiting.push(resolve); });
const release = () => { const next = waiting.shift(); if (next) next(); else running--; };

async function hdProfilePicture(userID, fallbackUrls = []) {
	const key = String(userID || "");
	const hit = key && CACHE.get(key);
	if (hit && Date.now() - hit.at < (hit.hd ? HD_TTL : LOW_TTL)) return hit.value;

	const disk = key ? readDisk(key) : null;
	if (disk && disk.width >= 500 && Date.now() - disk.at < DISK_TTL) {
		CACHE.set(key, { at: Date.now(), value: disk, hd: true });
		return disk;
	}

	await acquire();
	try {
		let value = await hdProfilePictureRaw(userID, fallbackUrls);
		if (value && (value.width || 0) >= 500) writeDisk(key, value);
		// Instagram only gave a thumbnail (throttled): an older HD copy is better.
		else if (disk && disk.width >= 500) value = disk;
		if (key && value) {
			CACHE.set(key, { at: Date.now(), value, hd: (value.width || 0) >= 400 });
			if (CACHE.size > MAX_CACHE) CACHE.delete(CACHE.keys().next().value);
		}
		return value;
	}
	finally { release(); }
}

module.exports = { setResolver, bestPicture, hdProfilePicture, imageSize, upsizedVariants };
