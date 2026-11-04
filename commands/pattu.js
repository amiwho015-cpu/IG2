"use strict";

/**
 * pattu — pic/video collection saved in a SEPARATE GitHub repo.
 *
 *   ?pattu add   (reply to a photo / video)  -> saves it to the GitHub repo
 *   ?pattu       -> sends a random saved pic/video to the chat (works in any GC)
 *   ?pattu count -> how many files are saved
 *
 * Environment (Render -> Environment):
 *   PATTU_REPO    "owner/repo"  <- the other repo where the media is stored (required)
 *   PATTU_TOKEN   GitHub token with Contents read/write (falls back to GITHUB_TOKEN)
 *   PATTU_BRANCH  default "main"
 *   PATTU_PATH    folder inside the repo, default "pattu"
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const axios = require("axios");

const API = "https://api.github.com";
const MAX_BYTES = 40 * 1024 * 1024;           // GitHub contents API is happiest under ~50 MB
const LIST_TTL_MS = 5 * 60 * 1000;
const TMP = path.join(os.tmpdir(), "instabot-pattu");
try { fs.mkdirSync(TMP, { recursive: true }); } catch (_) { /* ignore */ }

const MEDIA_EXT = ["jpg", "jpeg", "png", "webp", "gif", "mp4", "mov", "webm", "mkv"];

function settings(cfg) {
	const gh = (cfg && cfg.database && cfg.database.github) || {};
	return {
		token: process.env.PATTU_TOKEN || process.env.GITHUB_TOKEN || gh.token || "",
		repo: String(process.env.PATTU_REPO || process.env.GITHUB_REPO || gh.repo || "").trim(),
		branch: process.env.PATTU_BRANCH || process.env.GITHUB_BRANCH || gh.branch || "main",
		folder: String(process.env.PATTU_PATH || "pattu").replace(/^\/+|\/+$/g, "")
	};
}

function headers(s, accept) {
	return {
		Authorization: `Bearer ${s.token}`,
		Accept: accept || "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "instabot-pattu"
	};
}

function contentsUrl(s, name) {
	const rel = [s.folder, name].filter(Boolean).join("/");
	return `${API}/repos/${s.repo}/contents/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

function ready(s) {
	return !!(s.token && /^[^/\s]+\/[^/\s]+$/.test(s.repo));
}

/* ---------------------------------------------------------------- listing */

let listCache = { at: 0, files: [] };

async function listFiles(s, force) {
	if (!force && Date.now() - listCache.at < LIST_TTL_MS && listCache.files.length) return listCache.files;
	const res = await axios.get(`${contentsUrl(s, "")}?ref=${encodeURIComponent(s.branch)}`, {
		headers: headers(s),
		timeout: 30000,
		validateStatus: st => st === 200 || st === 404
	});
	const files = res.status === 404 || !Array.isArray(res.data)
		? []
		: res.data.filter(f => f.type === "file" && MEDIA_EXT.includes(path.extname(f.name).slice(1).toLowerCase())).map(f => f.name);
	listCache = { at: Date.now(), files };
	return files;
}

/* ------------------------------------------------------------------ upload */

function pickExt(att, contentType) {
	const ct = String(contentType || "").toLowerCase();
	if (ct.includes("mp4")) return "mp4";
	if (ct.includes("quicktime")) return "mov";
	if (ct.includes("webm")) return "webm";
	if (ct.includes("video")) return "mp4";
	if (ct.includes("png")) return "png";
	if (ct.includes("gif")) return "gif";
	if (ct.includes("webp")) return "webp";
	if (ct.includes("image")) return "jpg";
	try {
		const ext = path.extname(new URL(att.url).pathname).slice(1).toLowerCase();
		if (MEDIA_EXT.includes(ext)) return ext;
	}
	catch (_) { /* fall through */ }
	return att.type === "video" ? "mp4" : "jpg";
}

function attachmentUrl(att) {
	if (!att || typeof att !== "object") return null;
	if (att.type === "video") return att.url || att.playbackUrl || att.videoUrl || att.previewUrl || null;
	return att.url || att.largePreviewUrl || att.previewUrl || att.thumbnailUrl || null;
}

async function saveOne(s, att, uploader) {
	const url = attachmentUrl(att);
	if (!url) throw new Error("no media url on this attachment");
	const got = await axios.get(url, {
		responseType: "arraybuffer",
		timeout: 90000,
		maxContentLength: MAX_BYTES,
		maxBodyLength: MAX_BYTES,
		headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36" }
	});
	const buf = Buffer.from(got.data);
	if (!buf.length) throw new Error("empty download");
	if (buf.length > MAX_BYTES) throw new Error("file too big (max 40 MB)");
	const ext = pickExt(att, got.headers && got.headers["content-type"]);
	const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
	await axios.put(contentsUrl(s, name), {
		message: `pattu: add ${name}${uploader ? ` (by ${uploader})` : ""}`,
		content: buf.toString("base64"),
		branch: s.branch
	}, { headers: { ...headers(s), "Content-Type": "application/json" }, timeout: 120000, maxBodyLength: Infinity });
	return name;
}

/* ---------------------------------------------------------------- download */

async function fetchToTmp(s, name) {
	const res = await axios.get(`${contentsUrl(s, name)}?ref=${encodeURIComponent(s.branch)}`, {
		headers: headers(s, "application/vnd.github.raw+json"),
		responseType: "arraybuffer",
		timeout: 90000,
		maxContentLength: 100 * 1024 * 1024
	});
	const file = path.join(TMP, `${Date.now()}_${name}`);
	fs.writeFileSync(file, Buffer.from(res.data));
	const t = setTimeout(() => fs.unlink(file, () => { }), 10 * 60 * 1000);
	if (t.unref) t.unref();
	return file;
}

/* ----------------------------------------------------------------- command */

module.exports = {
	config: {
		name: "pattu",
		aliases: ["patu"],
		version: "1.0",
		author: "InstaBOT",
		countDown: 3,
		role: 0,
		category: "fun",
		shortDescription: { en: "Save pics/videos to GitHub and get a random one" },
		longDescription: { en: "Reply to a photo/video with 'pattu add' to save it in a GitHub repo. 'pattu' sends a random saved one." },
		guide: {
			en: "{pn} add (reply to photo/video) - save it\n{pn} - random pic/video\n{pn} count - how many saved"
		}
	},

	onStart: async function ({ message, event, args, config }) {
		const s = settings(config);
		if (!ready(s)) {
			const missing = [];
			if (!/^[^/\s]+\/[^/\s]+$/.test(s.repo)) missing.push(s.repo ? `PATTU_REPO thik noy ("${s.repo}", hobe owner/repo)` : "repo nai (GITHUB_REPO)");
			if (!s.token) missing.push("token nai (PATTU_TOKEN ba GITHUB_TOKEN)");
			return message.reply(`❌ Pattu setup baki: ${missing.join(" | ")}`);
		}

		const sub = String(args[0] || "").toLowerCase();

		/* ---- ?pattu add ---- */
		if (sub === "add") {
			const replied = event.messageReply;
			const atts = ((replied && replied.attachments) || []).filter(a => attachmentUrl(a));
			if (!atts.length) {
				return message.reply("❌ Kono pic/video te reply diye `pattu add` likho.");
			}
			try { await message.react("⏳"); } catch (_) { /* ignore */ }
			let ok = 0;
			let lastError = "";
			for (const att of atts) {
				try { await saveOne(s, att, event.senderID); ok++; }
				catch (error) {
					lastError = (error && error.response && error.response.status ? `HTTP ${error.response.status} ` : "") + String((error && error.message) || error);
				}
			}
			if (ok) listCache.at = 0; // refresh the list next time
			try { await message.react(ok ? "✅" : "❌"); } catch (_) { /* ignore */ }
			if (!ok) return message.reply(`❌ Save hoyni: ${lastError}`.slice(0, 300));
			return message.reply(`✅ ${ok} ta pattu add hoyeche${ok < atts.length ? ` (${atts.length - ok} ta fail)` : ""}.`);
		}

		/* ---- ?pattu count ---- */
		if (sub === "count") {
			try {
				const files = await listFiles(s, true);
				return message.reply(`📦 Total pattu: ${files.length}`);
			}
			catch (error) {
				return message.reply(`❌ ${(error && error.message) || error}`.slice(0, 300));
			}
		}

		/* ---- ?pattu (random) ---- */
		try {
			const files = await listFiles(s, false);
			if (!files.length) return message.reply("📭 Ekhono kichu add kora nai. Pic/video te reply diye `pattu add` dao.");
			const pick = files[Math.floor(Math.random() * files.length)];
			const file = await fetchToTmp(s, pick);
			return await message.reply({ attachment: file });
		}
		catch (error) {
			const code = error && error.response && error.response.status;
			return message.reply(`❌ Pattu pathano gelo na${code ? ` (HTTP ${code})` : ""}: ${(error && error.message) || error}`.slice(0, 300));
		}
	}
};
		
