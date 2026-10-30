"use strict";

/**
 * Helper for the canvas endpoints on the toshiro API host:
 *   /api/canvas/batslap | beautiful | horny | welcome | welcard
 *
 * The endpoints' parameter names are not documented, so each call sends the values
 * under the common names, one naming style per attempt (image1/image2, avatar1/avatar2,
 * url1/url2 ...), reads a "missing parameter" answer to learn the real names, and
 * remembers the style that worked. The answer can be the picture itself or JSON
 * holding a picture link - both are handled.
 *
 * Author: Shihab
 */

const axios = require("axios");

const BASE = process.env.CANVAS_API_BASE || "https://toshiro-api-editz6t9.vercel.app/api/canvas";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// semantic field -> names the API might use for it (tried in this order, one style per attempt)
const ALIASES = {
	avatar: ["avatar", "image", "url", "pfp", "img", "image_url", "avatarUrl", "profile", "photo", "picture"],
	avatar1: ["avatar1", "image1", "url1", "pfp1", "img1", "user1", "avatar", "image"],
	avatar2: ["avatar2", "image2", "url2", "pfp2", "img2", "user2", "avatar_2", "image_2"],
	name: ["name", "username", "user", "userName", "nickname", "member", "text1"],
	group: ["groupname", "group", "gcname", "gc", "threadname", "thread", "boxname", "server", "text2", "title"],
	count: ["membercount", "count", "members", "member", "memberCount", "number", "text3", "total"],
	text: ["text", "msg", "message", "caption", "content"],
	bg: ["bg", "background", "bgurl", "cover", "banner"]
};

const working = {}; // endpoint -> attempt index that worked
const isHttp = v => typeof v === "string" && /^https?:\/\//i.test(v);

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

const looksLikeImage = (buffer, type) =>
	/^image\//i.test(type) ||
	/^(89504e47|ffd8ff|47494638)/.test(buffer.slice(0, 4).toString("hex")) ||
	(buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP");

function reasonOf(buffer, status) {
	let text = "";
	try {
		const j = JSON.parse(buffer.toString("utf8"));
		const r = j && j.result && typeof j.result === "object" ? j.result : {};
		const m = j.message || j.error || j.msg || j.detail || r.message || r.error;
		text = m ? (typeof m === "object" ? JSON.stringify(m) : String(m)) : JSON.stringify(j);
	}
	catch (_) { text = buffer.toString("utf8"); }
	text = text.replace(/\s+/g, " ").trim().slice(0, 140);
	return status ? `HTTP ${status}${text ? ": " + text : ""}` : (text || "empty answer");
}

function linkIn(v, depth = 0) {
	if (!v || depth > 6) return null;
	if (isHttp(v)) return v;
	if (Array.isArray(v)) { for (const x of v) { const f = linkIn(x, depth + 1); if (f) return f; } return null; }
	if (typeof v === "object") {
		for (const k of ["image", "imageUrl", "image_url", "url", "result", "data", "link", "download", "output"])
			if (v[k]) { const f = linkIn(v[k], depth + 1); if (f) return f; }
		for (const k of Object.keys(v)) { const f = linkIn(v[k], depth + 1); if (f) return f; }
	}
	return null;
}

/** Names a "missing parameter" style answer asks for, e.g. "Missing parameters: image1, image2". */
function namesFromError(buffer) {
	let text = "";
	try { text = JSON.stringify(JSON.parse(buffer.toString("utf8"))); } catch (_) { text = buffer.toString("utf8"); }
	const found = new Set();
	const all = Object.values(ALIASES).flat();
	for (const name of all) if (new RegExp(`(^|[^a-zA-Z0-9_])${name}([^a-zA-Z0-9_]|$)`).test(text)) found.add(name);
	return [...found];
}

/** One attempt: fields {semantic: value} -> query using alias #index of each field (or a learned name map). */
function buildQuery(fields, index, learned) {
	const q = {};
	for (const [field, value] of Object.entries(fields)) {
		if (value == null || value === "") continue;
		const list = ALIASES[field] || [field];
		if (learned) {
			const hit = list.find(n => learned.includes(n));
			if (hit) { q[hit] = value; continue; }
		}
		q[list[Math.min(index, list.length - 1)]] = value;
	}
	return q;
}

async function download(url) {
	const res = await axios.get(url, {
		responseType: "arraybuffer", timeout: 30000, maxContentLength: 15 * 1024 * 1024,
		headers: { "User-Agent": UA, Accept: "image/*,*/*" }
	});
	const buffer = Buffer.from(res.data);
	if (buffer.length < 500) throw new Error("image too small");
	return { buffer, ext: extOf(buffer, String(res.headers["content-type"] || "")) };
}

/**
 * Ask a canvas endpoint for a picture.
 *   name   - "batslap", "welcard" ...
 *   fields - { avatar, avatar1, avatar2, name, group, count, text, bg } (only the ones the card needs)
 * Resolves { buffer, ext } or throws an Error with a short reason.
 */
async function canvas(name, fields, { timeout = 60000, attempts = 6 } = {}) {
	const endpoint = `${BASE}/${name}`;
	const order = working[name] != null ? [working[name]] : Array.from({ length: attempts }, (_, i) => i);
	let reason = "no response";
	let learned = null;

	for (let round = 0; round < 2; round++) {
		for (const index of (round === 0 ? order : [working[name] != null ? working[name] : 0])) {
			if (round === 1 && !learned) break;
			const params = buildQuery(fields, index, round === 1 ? learned : null);
			let res;
			try {
				res = await axios.get(endpoint, {
					params, responseType: "arraybuffer", timeout, maxContentLength: 25 * 1024 * 1024,
					headers: { "User-Agent": UA }, validateStatus: () => true
				});
			}
			catch (e) {
				// No answer at all (timeout / DNS / refused): other parameter names would fail the same way.
				throw new Error(`request failed: ${(e && e.message) || e}`);
			}

			const buffer = Buffer.from(res.data || []);
			const type = String(res.headers["content-type"] || "");
			if (res.status < 400 && buffer.length && looksLikeImage(buffer, type)) {
				working[name] = index;
				return { buffer, ext: extOf(buffer, type) };
			}
			if (res.status < 400 && buffer.length) {
				try {
					const link = linkIn(JSON.parse(buffer.toString("utf8")));
					if (link) { const img = await download(link); working[name] = index; return img; }
				}
				catch (_) { /* fall through to the reason */ }
			}
			reason = reasonOf(buffer, res.status >= 400 ? res.status : 0);
			const names = namesFromError(buffer);
			if (names.length) learned = names;
		}
		if (!learned) break;
	}
	throw new Error(reason);
}

module.exports = { canvas, ALIASES, BASE };
