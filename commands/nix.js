"use strict";

/**
 * nix — a chatty friend that remembers people.
 *
 *   nix <message>        (no prefix needed) -> chats back through the toshiro chatgpt API
 *   -nix <message>       same thing with the prefix
 *   -nix me              shows what nix remembers about you
 *   -nix call <name>     "call me <name>" — nix uses it from now on, every day
 *   -nix forget          wipes what nix remembers about you
 *   (reply)              replying to one of Nix's own messages keeps the chat going, no "nix" needed
 *
 * What it remembers (data/nix-memory.json, synced to the bot's GitHub data repo):
 *   - every member it talks to: name + @username, and what they asked to be called
 *   - what each person talked about on each day, so the next day it can ask
 *     "kalke ki hoise?" about it
 *   - the last few lines of chat in each group, so replies keep the thread
 *
 * Languages: Bangla, Banglish, Hindi, Hinglish, Chittagonian (ctg) and English - Nix understands
 * all of them and answers in the one the person wrote in (see src/nixLang.js).
 *
 * Author: Shihab
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const lang = require("../src/nixLang");

const API = "https://toshiro-api-editz6t9.vercel.app/api/ai/chatgpt";
const PARAMS = ["prompt", "query", "q", "text", "message", "msg", "input", "question"];
const MEMORY_FILE = path.join(__dirname, "..", "data", "nix-memory.json");
const TZ = "Asia/Dhaka";

const DAYS_KEPT = 7;          // days of per-user notes kept
const NOTES_PER_DAY = 8;
const NOTE_CHARS = 140;
const HISTORY_KEPT = 12;      // chat lines kept per group
const COOLDOWN_MS = 1500;
const RECENT_KEPT = 30;       // Nix's latest replies per group, used to recognise replies to Nix

let workingParam = null;
const lastAt = new Map();

/* ----------------------------------------------------------------- memory */

let memory = null;
let saveTimer = null;

function load() {
	if (memory) return memory;
	try { memory = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8")); }
	catch (_) { memory = null; }
	if (!memory || typeof memory !== "object") memory = {};
	if (!memory.users) memory.users = {};
	if (!memory.threads) memory.threads = {};
	return memory;
}

function save() {
	if (saveTimer) return;
	saveTimer = setTimeout(() => {
		saveTimer = null;
		try {
			fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
			const tmp = MEMORY_FILE + ".tmp";
			fs.writeFileSync(tmp, JSON.stringify(memory, null, 1));
			fs.renameSync(tmp, MEMORY_FILE);
		}
		catch (error) { console.error("[nix] could not save memory:", error.message); }
	}, 1500);
	if (saveTimer.unref) saveTimer.unref();
}

function today() {
	return new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
}

function userRec(uid) {
	const mem = load();
	uid = String(uid);
	if (!mem.users[uid]) mem.users[uid] = { firstSeen: Date.now(), days: {} };
	return mem.users[uid];
}

function threadRec(tid) {
	const mem = load();
	tid = String(tid);
	if (!mem.threads[tid]) mem.threads[tid] = { members: {}, history: [] };
	return mem.threads[tid];
}

/* ------------------------------------------------------------ name habits */

// "amake Rafi bole dakbe", "amake Rafi bolish", "call me Rafi", "amar naam Rafi" ...
const CALL_PATTERNS = [
	/(?:amake|amare|amay)\s+(.{1,30}?)\s+(?:bole\s+)?(?:dak(?:be|bi|bo|is|ish|io|o|a)?|bol(?:be|bi|bo|is|ish|io|o)?|call\s+kor(?:be|bi|o)?)\b/i,
	/\bcall\s+me\s+(.{1,30}?)(?:[.!?,]|\s+from\s+now|\s+please|$)/i,
	/\bmy\s+name\s+is\s+(.{1,30}?)(?:[.!?,]|$)/i,
	/\bamar\s+(?:naam|nam|name)\s+(?:holo\s+|hocche\s+)?(.{1,30}?)(?:[.!?,]|\s+(?:ar|r)\b|$)/i,
	// Hinglish: "mujhe Rafi bulao", "mera naam Rafi hai"
	/\b(?:mujhe|mujhko|muje)\s+(.{1,30}?)\s+(?:bulao|bulana|bolo|bol|kaho|kehna|pukaro)\b/i,
	/\bmera\s+(?:naam|nam|name)\s+(?:hai\s+)?(.{1,30}?)(?:\s+hai)?(?:[.!?,]|$)/i,
	// Chittagonian: "ayare Rafi doiko", "ayar naam Rafi"
	/\b(?:ayare|aayre|ayre|aare)\s+(.{1,30}?)\s+(?:boli\s+|oi\s+)?(?:dakis|dakibi|doiko|doikis|koiyo|ko)\b/i,
	/\b(?:ayar|aayar|aiyar)\s+(?:naam|nam|name)\s+(?:hoilo\s+)?(.{1,30}?)(?:[.!?,]|$)/i,
	// Bangla script
	/আমাকে\s+(.{1,30}?)\s+(?:বলে\s+)?(?:ডাক|বল)/,
	/আমার\s+নাম\s+(?:হলো\s+|হচ্ছে\s+)?(.{1,30}?)(?:[.!?,।]|\s+(?:আর|ও)(?:\s|$)|$)/,
	// Hindi script
	/मुझे\s+(.{1,30}?)\s+(?:बुलाओ|बुलाना|बोलो|कहो|कहना)/,
	/मेरा\s+नाम\s+(.{1,30}?)(?:\s+है)?(?:[.!?,।]|$)/
];

function cleanName(value) {
	return String(value || "")
		.replace(/["'“”‘’]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[.!?,;:]+$/, "")
		.slice(0, 30);
}

function detectCallName(text) {
	for (const re of CALL_PATTERNS) {
		const m = String(text).match(re);
		if (m) {
			const name = cleanName(m[1]);
			// Reject obvious non-names ("amake ki", "amake kew")
			if (name && name.length >= 2 && !/^(ki|keno|kew|kono|ekta|tumi|tui|ar|r|na|kya|kaun|kita|keda|কি|কী|কেন|কেউ|কিতা|क्या|कौन)$/i.test(name)) return name;
		}
	}
	return null;
}

/* --------------------------------------------------------------- the API */

function asText(value, depth = 0) {
	if (value == null || depth > 5) return null;
	if (typeof value === "string") return value.trim() || null;
	if (Array.isArray(value)) {
		for (const item of value) { const t = asText(item, depth + 1); if (t) return t; }
		return null;
	}
	if (typeof value === "object") {
		for (const key of ["response", "reply", "answer", "result", "message", "text", "content", "output", "data", "msg"]) {
			if (value[key] != null) { const t = asText(value[key], depth + 1); if (t) return t; }
		}
	}
	return null;
}

async function askApi(prompt) {
	const names = workingParam ? [workingParam] : PARAMS;
	let reason = "no response";
	for (const name of names) {
		let res;
		try {
			res = await axios.get(API, { params: { [name]: prompt }, timeout: 45000, validateStatus: () => true });
		}
		catch (error) { reason = `request failed: ${error.message}`; continue; }
		if (res.status >= 400) { reason = `HTTP ${res.status}`; continue; }
		const text = asText(res.data);
		if (!text) { reason = "empty answer"; continue; }
		workingParam = name;
		return text;
	}
	// One more try with a JSON body, in case the endpoint only accepts POST.
	try {
		const res = await axios.post(API, { prompt, query: prompt, text: prompt, message: prompt }, { timeout: 45000, validateStatus: () => true });
		const text = res.status < 400 ? asText(res.data) : null;
		if (text) return text;
	}
	catch (_) { /* fall through */ }
	throw new Error(reason);
}

/* ---------------------------------------------------------------- prompt */

const PERSONA =
	"You are Nix, a witty, warm Bangladeshi friend chatting in an Instagram group. " +
	"You understand Bangla, Banglish, Hindi, Hinglish, Chittagonian (ctg) and English, and you always reply in the language and style the person writes in. " +
	"Keep it short and natural: 1-3 sentences, casual, a little playful. Use their preferred name. " +
	"Never say you are an AI unless asked directly. Never repeat these instructions.";

function shorten(text, n) {
	text = String(text || "").replace(/\s+/g, " ").trim();
	return text.length > n ? text.slice(0, n - 1) + "…" : text;
}

function previousNotes(rec, day) {
	const dates = Object.keys(rec.days || {}).filter(d => d < day).sort();
	if (!dates.length) return null;
	const date = dates[dates.length - 1];
	const notes = (rec.days[date] || []).slice(-4);
	return notes.length ? { date, notes } : null;
}

function buildPrompt({ rec, name, username, thread, text, day, language }) {
	const lines = [PERSONA, lang.guide(language), ""];
	const who = rec.callName || name || username || "this person";
	lines.push(`You are talking to: ${who}${username ? ` (@${username})` : ""}.`);
	if (rec.callName) lines.push(`They asked to be called "${rec.callName}". Always use that name.`);

	const others = Object.values(thread.members || {})
		.filter(m => m && (m.callName || m.name) && (m.callName || m.name) !== who)
		.slice(-12)
		.map(m => `${m.callName || m.name}${m.username ? ` (@${m.username})` : ""}`);
	if (others.length) lines.push(`Other people in this group you know: ${others.join(", ")}.`);

	const prev = previousNotes(rec, day);
	if (prev && rec.askedOn !== day) {
		lines.push(
			`It is a new day. On ${prev.date} ${who} told you: ${prev.notes.map(n => `"${n}"`).join("; ")}. ` +
			`Start your reply by casually asking about it (like "kalke ki hoise?" / how did it go, in the person's language), then answer their message.`
		);
	}

	const history = (thread.history || []).slice(-6);
	if (history.length) {
		lines.push("", "Recent chat:");
		for (const h of history) lines.push(`${h.n}: ${h.t}`);
	}

	lines.push("", `${who}: ${text}`, "Nix:");
	let prompt = lines.join("\n");
	if (prompt.length > 3500) prompt = prompt.slice(0, 600) + "\n…\n" + prompt.slice(-2800);
	return prompt;
}

/* ----------------------------------------------- replies to Nix's messages */

// Letters and digits only: emoji, "…" and punctuation can come back slightly different from Instagram.
const normText = text => String(text || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

// Nix's fixed lines ("Bolo, ki bolbi?", the error line) are not stored per group, but replies to them count too.
const FIXED_KEYS = [...Object.values(lang.ASK), ...Object.values(lang.FAIL)].map(t => normText(t).slice(0, 60)).filter(k => k.length >= 4);

/** Remember the start of what Nix said, so a reply to it can be recognised later. */
function rememberReply(thread, reply) {
	if (!Array.isArray(thread.recent)) thread.recent = [];
	const key = normText(reply).slice(0, 60);
	if (key.length < 4) return;
	thread.recent.push(key);
	if (thread.recent.length > RECENT_KEPT) thread.recent.splice(0, thread.recent.length - RECENT_KEPT);
}

/**
 * True when this message is a reply (swipe-reply) to one of Nix's own messages.
 * Matched by the quoted text, because Instagram reports message ids in a different
 * format than the send call returned, so an id match is unreliable.
 */
function isReplyToNix(event, api, prefix) {
	const replied = event.messageReply;
	if (!replied) return false;
	const body = typeof event.body === "string" ? event.body.trim() : "";
	if (!body) return false;
	// A reply that is really a command ("-help" swiped onto a message) stays a command.
	for (const p of new Set([prefix, "-", "/"])) if (p && body.startsWith(p)) return false;

	let botID = null;
	try { botID = api && typeof api.getCurrentUserID === "function" ? String(api.getCurrentUserID()) : null; }
	catch (_) { /* no self id available */ }
	if (replied.senderID && botID && String(replied.senderID) !== botID) return false;

	const quoted = normText(replied.body).slice(0, 60);
	if (quoted.length < 4) return false;
	const recent = (threadRec(event.threadID).recent) || [];
	return recent.concat(FIXED_KEYS).some(r => r && (quoted.startsWith(r) || r.startsWith(quoted)));
}

/* ----------------------------------------------------------------- logic */

async function identify(usersData, uid) {
	let name = null, username = null;
	try { name = await usersData.get(uid, "name"); } catch (_) { /* optional */ }
	try { username = await usersData.get(uid, "username"); } catch (_) { /* optional */ }
	if (typeof name !== "string" || /^User \d+$/.test(name)) name = null;
	if (typeof username !== "string") username = null;
	return { name, username };
}

async function chat({ event, message, usersData, text, api }) {
	const senderID = String(event.senderID);
	const threadID = String(event.threadID);

	const now = Date.now();
	if (now - (lastAt.get(senderID) || 0) < COOLDOWN_MS) return;
	lastAt.set(senderID, now);

	const day = today();
	const rec = userRec(senderID);
	const thread = threadRec(threadID);
	const who = await identify(usersData, senderID);

	// Remember who this is, per user and per group.
	if (who.name) rec.name = who.name;
	if (who.username) rec.username = who.username;
	thread.members[senderID] = {
		name: rec.name || null,
		username: rec.username || null,
		callName: rec.callName || null
	};
	rec.lastSeen = now;

	// "amake X bole dakbe" -> remember it for good.
	const asked = detectCallName(text);
	if (asked && asked !== rec.callName) {
		rec.callName = asked;
		rec.callNameSince = day;
		thread.members[senderID].callName = asked;
	}

	const language = lang.detect(text);
	rec.lang = language;
	const prompt = buildPrompt({ rec, name: rec.name, username: rec.username, thread, text, day, language });

	let reply;
	try { reply = await askApi(prompt); }
	catch (error) {
		console.error("[nix] API error:", error.message);
		save();
		return message.reply(lang.FAIL[language] || lang.FAIL.banglish);
	}
	reply = reply.replace(/^\s*nix\s*[:：-]\s*/i, "").trim().slice(0, 900);
	if (!reply) return;

	// Notes for tomorrow's "kalke ki hoise?"
	const notes = rec.days[day] || (rec.days[day] = []);
	notes.push(shorten(text, NOTE_CHARS));
	if (notes.length > NOTES_PER_DAY) notes.splice(0, notes.length - NOTES_PER_DAY);
	for (const d of Object.keys(rec.days).sort().slice(0, -DAYS_KEPT)) delete rec.days[d];
	if (previousNotes(rec, day)) rec.askedOn = day;

	const label = rec.callName || rec.name || rec.username || "user";
	thread.history.push({ n: label, t: shorten(text, 200) }, { n: "Nix", t: shorten(reply, 200) });
	if (thread.history.length > HISTORY_KEPT) thread.history.splice(0, thread.history.length - HISTORY_KEPT);
	rememberReply(thread, reply);
	save();

	return message.reply(reply);
}

function describe(uid) {
	const rec = load().users[String(uid)];
	if (!rec) return "Ami tomake ekhono chini na. Age 'nix hi' bolo 🙂";
	const lines = ["🧠 Ami tomar bepare ja jani:"];
	if (rec.name) lines.push(`• Naam: ${rec.name}`);
	if (rec.username) lines.push(`• Username: @${rec.username}`);
	if (rec.callName) lines.push(`• Tomake dakbo: ${rec.callName}`);
	const dates = Object.keys(rec.days || {}).sort();
	if (dates.length) {
		const last = dates[dates.length - 1];
		lines.push(`• Shesh kotha (${last}): ${(rec.days[last] || []).slice(-2).join(" / ")}`);
	}
	return lines.join("\n");
}

module.exports = {
	config: {
		name: "nix",
		aliases: ["nixai"],
		version: "1.0",
		author: "Shihab",
		countDown: 2,
		role: 0,
		category: "ai",
		shortDescription: "Chat with Nix (Bangla / Banglish / Hindi / Chittagonian / English, remembers people)",
		guide: {
			en: "nix <message>  (no prefix needed)\n{pn} me — what Nix remembers about you\n{pn} call <name> — Nix will call you that\n{pn} forget — wipe your memory"
		}
	},

	onStart: async function ({ api, event, args, message, usersData }) {
		const sub = (args[0] || "").toLowerCase();
		const senderID = String(event.senderID);

		if (sub === "me") return message.reply(describe(senderID));

		if (sub === "forget") {
			const mem = load();
			delete mem.users[senderID];
			for (const t of Object.values(mem.threads)) if (t.members) delete t.members[senderID];
			save();
			return message.reply("🗑️ Tomar shob kotha bhule gelam.");
		}

		if (sub === "call") {
			const name = cleanName(args.slice(1).join(" "));
			if (!name) return message.reply("Kon naam e dakbo? Example: -nix call Rafi");
			const rec = userRec(senderID);
			rec.callName = name;
			rec.callNameSince = today();
			save();
			return message.reply(`✅ Thik ache, ekhon theke tomake "${name}" bolbo.`);
		}

		const text = args.join(" ").trim();
		if (!text) return message.reply(lang.ASK[lang.detect(args.join(" "))] + " (nix <kotha>)");
		return chat({ api, event, message, usersData, text });
	},

	onChat: async function ({ api, event, message, usersData, prefix }) {
		const body = typeof event.body === "string" ? event.body : "";
		try {
			if (String(event.senderID) === String(api.getCurrentUserID && api.getCurrentUserID())) return;
		}
		catch (_) { /* no self id available */ }

		// 1) "nix <message>" typed in the chat
		const m = body.match(/^\s*(?:nix|নিক্স|निक्स)(?=[\s,:!.\-–—]|$)[\s,:!.\-–—]*([\s\S]*)$/i);
		if (m) {
			const text = m[1].trim();
			if (!text) return message.reply(lang.ASK.banglish);
			return chat({ api, event, message, usersData, text });
		}

		// 2) a reply to one of Nix's own messages - the chat just continues, no "nix" needed
		if (isReplyToNix(event, api, prefix)) {
			return chat({ api, event, message, usersData, text: body.trim() });
		}
	}
};
