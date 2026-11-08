"use strict";

/**
 * shihab - a chat friend named Shihab (toshiro gpt5 API) that keeps a private state per person.
 *
 *   shihab <message>     (no prefix needed) -> chats back
 *   (reply)              swipe-replying to one of Shihab's own messages keeps the chat going
 *   -shihab me           shows what Shihab remembers about you
 *   -shihab call <name>  Shihab calls you that from now on
 *   -shihab forget       wipes your memory
 *   shihab ai-song <idea> / shihab gan make <idea> / -shihab Create a funny Chittagong music
 *                        -> makes a brand new song with the AI (toshiro ai-music API, the original job of this command)
 *   shihab gan chara <name> / shihab song <name>  -> plays that song from YouTube (the sing command)
 *   -aimusic <idea> / -aisong <idea>              -> always makes an AI song
 *   Asking who the owner is ("tor owner ke", "who made you") or what Shihab does ("tui ki ki korish",
 *   "who are you") gets a fixed answer, sent in parts because Instagram caps one text near 1000 characters.
 *
 * Rules it follows:
 *   - Language: Banglish by default. Whatever language / script the person writes in
 *     (Bangla, Banglish, English, Hindi, Hinglish, Chittagonian) is the language they get back.
 *     Each person's last language is remembered, so a short "ok" keeps their language.
 *   - One person = one private state: their own name, @username, chosen name, language and
 *     their own recent chat. Nothing from one person is ever put in another person's prompt,
 *     and every answer starts with the @username of the person it is for.
 *   - Memory lives in data/shihab-memory.json, which the bot syncs to its GitHub data repo
 *     (src/database.js lists the file).
 *
 * Author: Shihab
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const axios = require("axios");
const fse = require("fs-extra");
const lang = require("../src/nixLang");

const API = "https://toshiro-api-editz6t9.vercel.app/api/ai/gpt5";
const PARAMS = ["prompt", "query", "q", "text", "message", "msg", "input", "question"];
const MEMORY_FILE = path.join(__dirname, "..", "data", "shihab-memory.json");
const TZ = "Asia/Dhaka";

const HISTORY_KEPT = 10;      // chat lines kept per person (5 exchanges)
const DAYS_KEPT = 7;
const NOTES_PER_DAY = 8;
const NOTE_CHARS = 140;
const COOLDOWN_MS = 1500;
const RECENT_KEPT = 60;       // Shihab's latest replies, used to recognise a swipe-reply to him

let workingParam = null;
const lastAt = new Map();

/* ----------------------------------------------------------- fixed lines */

// Own wording (different from Nix) so a swipe-reply to one bot never wakes the other.
const ASK = {
	ctg: "Ko bondhu, kita jante saiyo? 🙂",
	bn: "বলো বন্ধু, কী জানতে চাও? 🙂",
	hi: "Bolo dost, kya jaanna hai? 🙂",
	hinglish: "Bolo dost, kya jaanna hai? 🙂",
	banglish: "Bolo Ki bolbe..? 🙂",
	en: "Tell me, friend - what's on your mind? 🙂"
};
const FAIL = {
	ctg: "😵 Shihab er ekkhoin jhamela oiyyo, abar ko.",
	bn: "😵 শিহাবের একটু সমস্যা হচ্ছে, আবার বলো।",
	hi: "😵 Shihab ko thodi problem aa gayi, phir se bolo.",
	hinglish: "😵 Shihab ko thodi problem aa gayi, phir se bolo.",
	banglish: "Ektu Jhamela hoise Abar bolo..! 😵",
	en: "😵 Shihab ran into a problem, please try again."
};

/* ----------------------------------------------------------------- memory */

let memory = null;
let saveTimer = null;

function load() {
	if (memory) return memory;
	try { memory = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8")); }
	catch (_) { memory = null; }
	if (!memory || typeof memory !== "object") memory = {};
	if (!memory.users) memory.users = {};
	if (!Array.isArray(memory.recent)) memory.recent = [];
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
		catch (error) { console.error("[shihab] could not save memory:", error.message); }
	}, 1500);
	if (saveTimer.unref) saveTimer.unref();
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD

function userRec(uid) {
	const mem = load();
	uid = String(uid);
	if (!mem.users[uid]) mem.users[uid] = { firstSeen: Date.now(), history: [], days: {} };
	const rec = mem.users[uid];
	if (!Array.isArray(rec.history)) rec.history = [];
	if (!rec.days) rec.days = {};
	return rec;
}

/* ------------------------------------------------------------ name habits */

const CALL_PATTERNS = [
	/(?:amake|amare|amay)\s+(.{1,30}?)\s+(?:bole\s+)?(?:dak(?:be|bi|bo|is|ish|io|o|a)?|bol(?:be|bi|bo|is|ish|io|o)?|call\s+kor(?:be|bi|o)?)\b/i,
	/\bcall\s+me\s+(.{1,30}?)(?:[.!?,]|\s+from\s+now|\s+please|$)/i,
	/\bmy\s+name\s+is\s+(.{1,30}?)(?:[.!?,]|$)/i,
	/\bamar\s+(?:naam|nam|name)\s+(?:holo\s+|hocche\s+)?(.{1,30}?)(?:[.!?,]|\s+(?:ar|r)\b|$)/i,
	/\b(?:mujhe|mujhko|muje)\s+(.{1,30}?)\s+(?:bulao|bulana|bolo|bol|kaho|kehna|pukaro)\b/i,
	/\bmera\s+(?:naam|nam|name)\s+(?:hai\s+)?(.{1,30}?)(?:\s+hai)?(?:[.!?,]|$)/i,
	/\b(?:ayare|aayre|ayre|aare)\s+(.{1,30}?)\s+(?:boli\s+|oi\s+)?(?:dakis|dakibi|doiko|doikis|koiyo|ko)\b/i,
	/\b(?:ayar|aayar|aiyar)\s+(?:naam|nam|name)\s+(?:hoilo\s+)?(.{1,30}?)(?:[.!?,]|$)/i,
	/আমাকে\s+(.{1,30}?)\s+(?:বলে\s+)?(?:ডাক|বল)/,
	/আমার\s+নাম\s+(?:হলো\s+|হচ্ছে\s+)?(.{1,30}?)(?:[.!?,।]|\s+(?:আর|ও)(?:\s|$)|$)/,
	/मुझे\s+(.{1,30}?)\s+(?:बुलाओ|बुलाना|बोलो|कहो|कहना)/,
	/मेरा\s+नाम\s+(.{1,30}?)(?:\s+है)?(?:[.!?,।]|$)/
];

function cleanName(value) {
	return String(value || "").replace(/["'“”‘’]/g, "").replace(/\s+/g, " ").trim().replace(/[.!?,;:]+$/, "").slice(0, 30);
}

function detectCallName(text) {
	for (const re of CALL_PATTERNS) {
		const m = String(text).match(re);
		if (m) {
			const name = cleanName(m[1]);
			if (name && name.length >= 2 && !/^(ki|keno|kew|kono|ekta|tumi|tui|ar|r|na|kya|kaun|kita|keda|কি|কী|কেন|কেউ|কিতা|क्या|कौन)$/i.test(name)) return name;
		}
	}
	return null;
}

/* ------------------------------------------------------------------ language */

/**
 * Banglish is the default. A real sentence in another language gets that language back;
 * a very short or ambiguous message ("ok", "hi", an emoji) keeps the person's last language.
 */
function pickLanguage(text, rec) {
	const detected = lang.detect(text);
	const words = (String(text).toLowerCase().match(/[a-z]+/g) || []);
	const hasScript = /[\u0900-\u097F\u0980-\u09FF]/.test(text);
	if (detected === "en" && !hasScript && words.length <= 2) return rec.lang || "banglish";
	return detected;
}

/* ------------------------------------------------------------------ the API */

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
		try { res = await axios.get(API, { params: { [name]: prompt }, timeout: 45000, validateStatus: () => true }); }
		catch (error) { reason = `request failed: ${error.message}`; continue; }
		if (res.status >= 400) { reason = `HTTP ${res.status}`; continue; }
		const text = asText(res.data);
		if (!text) { reason = "empty answer"; continue; }
		workingParam = name;
		return text;
	}
	try {
		const res = await axios.post(API, { prompt, query: prompt, text: prompt, message: prompt }, { timeout: 45000, validateStatus: () => true });
		const text = res.status < 400 ? asText(res.data) : null;
		if (text) return text;
	}
	catch (_) { /* fall through */ }
	throw new Error(reason);
}

/* ------------------------------------------------------------------- prompt */

const PERSONA =
	"You are Shihab, the group's favourite naughty entertainment bot on Instagram, made by your owner Arfatul Islam Shihab from Chittagong. " +
	"Your vibe: funny, playful, a little mischievous, never boring. You love fun, songs, stories, adda and making people smile. " +
	"With friends: joke around, light trolling, funny replies, gentle roasts. A roast is always harmless: never about family, looks, religion or anything painful, and stop at once if the person gets upset. " +
	"With girls: be sweet and charming, cute compliments and light playful flirting, always respectful and PG. No sexual content ever. If she seems uncomfortable, or the person seems under 18, drop the flirting and stay friendly. " +
	"If someone sounds sad, tired or stressed: drop the jokes, be warm and comforting first, then gently try to lift their mood. " +
	"If someone flirts with you, play along and tease back (\"dekhi ke beshi chalak\"), but stay classy. " +
	"Respect your owner Shihab and never speak badly about him. " +
	"Your default language is Banglish (Bangla written in English letters). " +
	"Always reply in the language and script the person writes in: Bangla script -> Bangla, English -> English, Hindi/Hinglish -> Hindi/Hinglish, Chittagonian -> Chittagonian, Banglish -> Banglish. " +
	"TYPING STYLE for Banglish (copy it exactly, it is how the owner types): very short casual lines, usually one line of 3-10 words, two at most. " +
	"Spell it like: valo (not bhalo), achi, acho, kmn, ki, koro, tumi, kothay, ekhon. Put a capital letter on some random words, not only the first (Tumi, Acho, Ki, Valo). " +
	"End with \"..!\" or \".?\" or \"..?\" instead of normal punctuation, and then put one or two fitting emojis at the very end (never in the middle). " +
	"Examples of the style: \"Valo achi Tumi kmn Acho.? 😊\", \"Ki koro..! 😄\", \"Ekhon Kothay Acho..? 🙂\", \"Hmm Bujhlam Tarpor Ki hoilo.? 😅\", \"Arre Valo Bolso To..! 😎\". " +
	"In Bangla script, English or Hindi keep the same short casual feel in that language. Use the person's preferred name. " +
	"You are talking to exactly one person. You know nothing about anyone else in the chat, so never mention, guess or repeat what other people said. " +
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

/** Only this person's own data goes in: nothing from any other user. */
function buildPrompt({ rec, text, day, language }) {
	const who = rec.callName || rec.name || rec.username || "this person";
	const lines = [PERSONA, lang.guide(language), ""];
	lines.push(`You are talking to: ${who}${rec.username ? ` (@${rec.username})` : ""}.`);
	if (rec.callName) lines.push(`They asked to be called "${rec.callName}". Always use that name.`);
	if (rec.gender === 1) lines.push("Their profile looks like a boy (a guess from the name, it may be wrong; never state it). Treat them as a friend: jokes, trolling, light roast.");
	else if (rec.gender === 2) lines.push("Their profile looks like a girl (a guess from the name, it may be wrong; never state it). Be sweet and charming, light respectful flirting is fine.");

	const prev = previousNotes(rec, day);
	if (prev && rec.askedOn !== day) {
		lines.push(
			`It is a new day. On ${prev.date} ${who} told you: ${prev.notes.map(n => `"${n}"`).join("; ")}. ` +
			"Start by casually asking about it (like \"kalke ki hoise?\" in the person's language), then answer their message."
		);
	}

	const history = rec.history.slice(-HISTORY_KEPT);
	if (history.length) {
		lines.push("", "Your earlier chat with this person:");
		for (const h of history) lines.push(`${h.r === "s" ? "Shihab" : who}: ${h.t}`);
	}
	lines.push("", `${who}: ${text}`, "Shihab:");
	let prompt = lines.join("\n");
	if (prompt.length > 3500) prompt = prompt.slice(0, 600) + "\n…\n" + prompt.slice(-2800);
	return prompt;
}

/* ------------------------------------------- replies to Shihab's messages */

const normText = text => String(text || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const FIXED_KEYS = [...Object.values(ASK), ...Object.values(FAIL)].map(t => normText(t).slice(0, 60)).filter(k => k.length >= 4);

function rememberReply(reply) {
	const mem = load();
	const key = normText(reply).slice(0, 60);
	if (key.length < 4) return;
	mem.recent.push(key);
	if (mem.recent.length > RECENT_KEPT) mem.recent.splice(0, mem.recent.length - RECENT_KEPT);
}

/** True for a swipe-reply to one of Shihab's own messages (matched by the quoted text). */
function isReplyToShihab(event, api, prefix) {
	const replied = event.messageReply;
	if (!replied) return false;
	const body = typeof event.body === "string" ? event.body.trim() : "";
	if (!body) return false;
	for (const p of new Set([prefix, "-", "/"])) if (p && body.startsWith(p)) return false;

	let botID = null;
	try { botID = api && typeof api.getCurrentUserID === "function" ? String(api.getCurrentUserID()) : null; }
	catch (_) { /* no self id available */ }
	if (replied.senderID && botID && String(replied.senderID) !== botID) return false;

	const quoted = normText(replied.body).slice(0, 60);
	if (quoted.length < 4) return false;
	return load().recent.concat(FIXED_KEYS).some(r => r && (quoted.startsWith(r) || r.startsWith(quoted)));
}

/* ------------------------------------------- fixed answers: owner and "what do you do" */

const OWNER_TEXT = `👑 𝗕𝗢𝗧 𝗢𝗪𝗡𝗘𝗥 𝗜𝗡𝗙𝗢 👑

━━━━━━━━━━━━━━━━━━
✨ 𝗣𝗘𝗥𝗦𝗢𝗡𝗔𝗟 𝗜𝗡𝗙𝗢 ✨
━━━━━━━━━━━━━━━━━━

🖤 𝗙𝘂𝗹𝗹 𝗡𝗮𝗺𝗲 : Arfatul Islam Shihab
🌍 𝗙𝗿𝗼𝗺 : Chittagong, Bangladesh 🇧🇩
🎂 𝗔𝗴𝗲 : 19+
🎓 𝗘𝗱𝘂𝗰𝗮𝘁𝗶𝗼𝗻 : HSC Completed 📚
💼 𝗢𝗰𝗰𝘂𝗽𝗮𝘁𝗶𝗼𝗻 : Working Student
👑 𝗣𝗼𝘀𝗶𝘁𝗶𝗼𝗻 : Bot Owner & Developer
💻 𝗜𝗻𝘁𝗲𝗿𝗲𝘀𝘁 : Coding, Technology & Bot Development
🚀 𝗗𝗿𝗲𝗮𝗺 : Build Something Extraordinary
🔥 𝗣𝗲𝗿𝘀𝗼𝗻𝗮𝗹𝗶𝘁𝘆 : Simple But Different
💯 𝗠𝗼𝘁𝘁𝗼 : Work Hard, Stay Humble, Keep Growing.

━━━━━━━━━━━━━━━━━━
💫 𝗔𝗕𝗢𝗨𝗧 𝗧𝗛𝗘 𝗢𝗪𝗡𝗘𝗥 💫
━━━━━━━━━━━━━━━━━━

Hey there! 👋 I'm Arfatul Islam Shihab, a working student from the beautiful city of Chittagong, Bangladesh. 🇧🇩

💻 I have a strong interest in technology, programming, automation, and developing smart bots. I enjoy learning new things, exploring innovative ideas, and turning creative concepts into reality.

🎯 I believe in improving myself every day, working towards my goals, and creating something meaningful through dedication and hard work.

👑 I'm the owner of this bot, and I'm continuously working to make it smarter, faster, and more useful for everyone.

❤️ Respect everyone, stay focused on your goals, and never stop learning!

⚡ 𝗢𝗪𝗡𝗘𝗥 𝗡𝗔𝗠𝗘: Shihab
🌐 𝗟𝗢𝗖𝗔𝗧𝗜𝗢𝗡: Chittagong, Bangladesh
🤖 𝗥𝗢𝗟𝗘: Creator & Owner

━━━━━━━━━━━━━━━━━━
🖤 𝗢𝗡𝗘 𝗡𝗔𝗠𝗘, 𝗢𝗡𝗘 𝗜𝗗𝗘𝗡𝗧𝗜𝗧𝗬 — 𝗦𝗛𝗜𝗛𝗔𝗕 👑
━━━━━━━━━━━━━━━━━━`;

const WORK_TEXT = `🤖✨ 𝗠𝗬 𝗪𝗢𝗥𝗞 & 𝗠𝗬 𝗩𝗜𝗕𝗘 ✨🤖

━━━━━━━━━━━━━━━━━━
😎 𝗔𝗠𝗜 𝗞𝗜 𝗞𝗜 𝗞𝗢𝗥𝗜? 😂
━━━━━━━━━━━━━━━━━━

😉 আমার কাজের কোনো শেষ নাই! আমি হলাম সবার প্রিয় দুষ্টু বট! 🤖💖

💘 মেয়েদের সাথে একটু Flirting করা, মিষ্টি মিষ্টি কথা বলা আর কথায় কথায় Smile এনে দেওয়া! 😜🌸

😂 বন্ধুদের সাথে মজা করা, Trolling করা, Funny Reply দেওয়া আর Group-এ হাসির পরিবেশ তৈরি করা! 🤣🔥

🥰 কেউ মন খারাপ করে থাকলে তার সাথে কথা বলা, Mood ভালো করার চেষ্টা করা আর একটু হাসানোর চেষ্টা করা! 💝✨

😈 বন্ধুদের হালকা Roast করা, মজার মজার Reply দেওয়া আর Group-এ দুষ্টুমি করে মাতিয়ে রাখা! 😂💥

🎶 গান, গল্প, আড্ডা, Fun আর Entertainment — সবকিছুতেই আমি Ready! 🎧😎

💬 কেউ কথা বলতে চাইলে কথা বলি, কেউ Joke করলে পাল্টা Joke দিই, আর কেউ Flirt করলে দেখি কে বেশি চালাক! 😉🤣

👑 আমার কাজ হলো Owner-এর সম্মান রাখা, Friends-দের সাথে Fun করা আর Group-কে Active রাখা! ❤️‍🔥

━━━━━━━━━━━━━━━━━━
🤣 𝗦𝗘𝗥𝗜𝗢𝗨𝗦 𝗞𝗢𝗧𝗛𝗔 𝗞𝗢𝗠
💖 𝗙𝗨𝗡 𝗕𝗘𝗦𝗛𝗜
😎 𝗙𝗟𝗜𝗥𝗧𝗜𝗡𝗚 𝗔𝗟𝗟𝗢𝗪𝗘𝗗
😂 𝗗𝗥𝗔𝗠𝗔 𝗨𝗡𝗟𝗜𝗠𝗜𝗧𝗘𝗗
━━━━━━━━━━━━━━━━━━

🤖 আমি শুধু একটা Bot না, আমি হলাম Group-এর Entertainment Machine! 😂👑

⚠️ সাবধান! আমার সাথে কথা বললে হাসতে হাসতে পেট ব্যথা হতে পারে! 🤣💀

💌 𝗠𝗔𝗗𝗘 𝗙𝗢𝗥 𝗙𝗨𝗡, 𝗕𝗨𝗜𝗟𝗧 𝗙𝗢𝗥 𝗘𝗡𝗧𝗘𝗥𝗧𝗔𝗜𝗡𝗠𝗘𝗡𝗧! 💖🔥`;

const PART_LIMIT = 900;      // Instagram texts are capped near 1000 characters, so long answers go out in parts

/** Cut at blank lines so each message stays under the limit and the text itself is untouched. */
function splitParts(text, limit = PART_LIMIT) {
	const parts = [];
	let current = "";
	for (const block of text.split("\n\n")) {
		const next = current ? current + "\n\n" + block : block;
		if (Array.from(next).length > limit && current) { parts.push(current); current = block; }
		else current = next;
	}
	if (current) parts.push(current);
	return parts;
}

const OWNER_RE = [
	/\b(?:your|ur|tor|tur|tomar|tomr|tumar|toder|tader|apnar|amader|er|ei)\s+(?:bot\s+)?(?:owner|malik|creator|developer|boss|maker)\b/,
	/\b(?:bot\s+)?(?:owner|malik|creator|developer|maker)\s+(?:ke|kee|ki|kon|koi|kothay|kaun|info|er|ar|name|naam|nam|k|kay)\b/,
	/\bowner\s*info\b/,
	/\bwho\s*(?:is|r|are|s)?\s*(?:your|ur|the|this)?\s*(?:bot\s+)?(?:owner|creator|developer|maker|boss)\b/,
	/\bwho\s+(?:made|created|built|owns|developed|programmed)\s+(?:you|u|this)\b/,
	/\b(?:ke|kay|kon|kaun)\s+(?:banaise|banaiche|banaisos|banaiso|banaisen|banalo|bananise|baniyeche|baniyese|banaya)\b/,
	/\bkis(?:ne)?\s+banaya\b/,
	/\bkar\s+(?:bot|banano|toiri|tori)\b/,
	/\bkiska\s+bot\b/,
	/\b(?:tomake|tore|toke|tumhe|tujhe|apnake)\s+ke\s+(?:banaise|banaiche|banalo|baniyeche)\b/,
	/(?:মালিক|ওনার|ডেভেলপার|ক্রিয়েটর|বানিয়েছে|বানাইছে|বানাইসে|বানালো)/,
	/(?:मालिक|ओनर|डेवलपर|किसने\s*बनाया)/
];

const WORK_RE = [
	/\b(?:tor|tomar|tomr|tumar|apnar|your|ur|tera|tumhara)\s+(?:kaj|kam|kaaj|kaam|work|job)\b/,
	/\b(?:kaj|kam|kaaj|kaam)\s+(?:ki|kya)\b/,
	/\b(?:tui|tumi|apni|tu|tum|aap)\s+(?:ki\s+ki|kya\s+kya)\s+(?:kor|kar|paro|paris|pari|pare)/,
	/\b(?:tui|tumi|apni|tu|tum|aap)\s+(?:ki|kya)\s+(?:kor|kar)(?:is|ish|o|e|ta|ti|te|na)?\b/,
	/\bwhat\s+(?:can\s+you|do\s+you|are\s+you)\s+(?:do|doing|capable|good)\b/,
	/\bwhat\s+do\s+you\s+do\b/,
	/\bwho\s+(?:are|r)\s+(?:you|u)\b/,
	/\b(?:tui|tumi|apni|tu|tum|aap)\s+(?:ke|kee|kon|kaun)\b/,
	/\b(?:introduce|intro)\s+(?:yourself|urself|tor|tomar)/,
	/(?:তুই|তুমি|আপনি)\s*(?:কে|কি\s*কি|কী\s*কী)/,
	/(?:তোর|তোমার|আপনার)\s*কাজ/,
	/কাজ\s*(?:কি|কী)/,
	/(?:तू|तुम|आप)\s*(?:कौन|क्या\s*क्या)/
];

/** "owner" for owner questions, "work" for "what do you do / who are you", otherwise null. */
function cannedKind(text) {
	const t = String(text).toLowerCase().replace(/[?!.,;:"'()]+/g, " ").replace(/\s+/g, " ").trim();
	if (t.length < 3 || t.length > 120) return null;
	if (OWNER_RE.some(re => re.test(t))) return "owner";
	if (WORK_RE.some(re => re.test(t))) return "work";
	return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sendCanned({ kind, rec, text, message }) {
	const parts = splitParts(kind === "owner" ? OWNER_TEXT : WORK_TEXT);
	for (const part of parts) rememberReply(part);
	rec.history.push({ r: "u", t: shorten(text, 200) }, { r: "s", t: kind === "owner" ? "(I shared the owner info)" : "(I told what I do)" });
	if (rec.history.length > HISTORY_KEPT) rec.history.splice(0, rec.history.length - HISTORY_KEPT);
	save();
	await message.reply(parts[0]);
	for (const part of parts.slice(1)) {
		await sleep(900);
		await (typeof message.send === "function" ? message.send(part) : message.reply(part));
	}
}

/* -------------------------------------------------------------------- chat */

async function identify(usersData, uid) {
	let name = null, username = null;
	try { name = await usersData.get(uid, "name"); } catch (_) { /* optional */ }
	try { username = await usersData.get(uid, "username"); } catch (_) { /* optional */ }
	if (typeof name !== "string" || /^User \d+$/.test(name)) name = null;
	if (typeof username !== "string") username = null;
	return { name, username: username ? username.replace(/^@/, "") : null };
}

/* ------------------------------------------------ AI music and song requests */
// The AI music maker (toshiro ai-music API) that this command had from the start, plus
// "play a song" through the bot's own sing command. Both are picked from the wording:
//   make / create / generate / banao / ai-song / ai-music   -> a brand new song made by the AI
//   gan chara / bajao / play / song <name> / sing <name>    -> an existing song from YouTube

const MUSIC_API = "https://toshiro-api-editz6t9.vercel.app/api/ai/ai-music";
const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;
const isHttp = v => typeof v === "string" && /^https?:\/\//i.test(v);

/** First audio-looking link anywhere in the API answer (images are skipped). */
function findAudioUrl(obj, depth = 0) {
	if (!obj || depth > 5) return null;
	if (isHttp(obj)) return IMAGE_RE.test(obj) ? null : obj;
	if (Array.isArray(obj)) { for (const x of obj) { const f = findAudioUrl(x, depth + 1); if (f) return f; } return null; }
	if (typeof obj === "object") {
		const keys = ["audio_url", "audioUrl", "audio", "song", "song_url", "music", "music_url", "mp3", "download", "downloadUrl", "download_url", "url", "link", "result", "data"];
		for (const k of keys) if (obj[k]) { const f = findAudioUrl(obj[k], depth + 1); if (f) return f; }
		for (const k of Object.keys(obj)) { const f = findAudioUrl(obj[k], depth + 1); if (f) return f; }
	}
	return null;
}

function findTitle(obj, depth = 0) {
	if (!obj || typeof obj !== "object" || depth > 4) return "";
	if (typeof obj.title === "string" && obj.title.trim()) return obj.title.trim();
	for (const k of Object.keys(obj)) { const t = findTitle(obj[k], depth + 1); if (t) return t; }
	return "";
}

function reasonOf(buffer, status) {
	let text = "";
	try {
		const j = JSON.parse(buffer.toString("utf8"));
		const m = j.message || j.error || j.msg || (j.result && (j.result.message || j.result.error));
		text = m ? (typeof m === "object" ? JSON.stringify(m) : String(m)) : JSON.stringify(j);
	}
	catch (_) { text = buffer.toString("utf8"); }
	text = text.replace(/\s+/g, " ").trim().slice(0, 120);
	return `HTTP ${status}${text ? ": " + text : ""}`;
}

function extOf(url, contentType) {
	const m = String(url || "").split("?")[0].match(/\.(mp3|m4a|aac|wav|ogg|webm|mp4)$/i);
	if (m) return m[1].toLowerCase();
	if (/mp4|m4a|aac/i.test(contentType || "")) return "m4a";
	if (/ogg/i.test(contentType || "")) return "ogg";
	if (/wav/i.test(contentType || "")) return "wav";
	return "mp3";
}

const makingSong = new Set();      // one song at a time per person: a song takes up to a minute or more

/** Make a song with the AI from the idea and send it (title card first, then the audio). */
async function makeAiSong({ api, event, message, prompt }) {
	const who = String(event.senderID);
	if (makingSong.has(who)) return message.reply("Ekta Gan toiri hocche Opekkha koro..! 🎵");
	makingSong.add(who);

	const react = emoji => Promise.resolve(api.setMessageReaction(emoji, event.messageID)).catch(() => { });
	await react("⏳");
	const wait = await message.reply("🎵 Creating your song, this can take a minute...").catch(() => null);
	const clearWait = async () => { if (wait && wait.messageID) { try { await api.unsendMessage(wait.messageID); } catch (_) { /* already gone */ } } };

	let file;
	try {
		const res = await axios.get(MUSIC_API, {
			params: { prompt }, responseType: "arraybuffer", timeout: 300000,
			maxContentLength: 40 * 1024 * 1024, validateStatus: () => true
		});
		const buffer = Buffer.from(res.data);
		const type = String(res.headers["content-type"] || "");
		if (res.status >= 400) throw new Error(reasonOf(buffer, res.status));

		let audio = null, title = "", ext = "mp3";
		if (/^audio\//i.test(type) || (!/json|text|html/i.test(type) && buffer.length > 50 * 1024)) {
			audio = buffer; ext = extOf("", type);               // the API answered with the song itself
		}
		else {
			let data;
			try { data = JSON.parse(buffer.toString("utf8")); }
			catch (_) { throw new Error(reasonOf(buffer, res.status)); }
			const url = findAudioUrl(data);
			if (!url) throw new Error(`no song in the answer (${reasonOf(buffer, res.status)})`);
			title = findTitle(data);
			const dl = await axios.get(url, { responseType: "arraybuffer", timeout: 120000, maxContentLength: 40 * 1024 * 1024, headers: { "User-Agent": "Mozilla/5.0" } });
			audio = Buffer.from(dl.data); ext = extOf(url, String(dl.headers["content-type"] || ""));
		}
		if (!audio || !audio.length) throw new Error("the song file was empty");

		file = path.join(os.tmpdir(), `shihab_${Date.now()}_${Math.floor(Math.random() * 1e4)}.${ext}`);
		await fse.writeFile(file, audio);

		await clearWait();
		await message.reply({ attachment: fs.createReadStream(file) });
		await react("✅");
	}
	catch (e) {
		console.error("[shihab] song failed:", (e && e.message) || e);
		await clearWait();
		await react("❌");
		return message.reply(`❌ Could not make the song: ${((e && e.message) || "try again").toString().slice(0, 200)}`);
	}
	finally {
		makingSong.delete(who);
		if (file) { const t = setTimeout(() => fse.remove(file).catch(() => { }), 20000); if (t.unref) t.unref(); }
	}
}

const PLAY_ACTION = "(?:bajao|bajaw|chara|chhar|chharo|dao|de|shonao|sunao|play|dhor|dhorish)";
const PLAY_RES = [
	new RegExp("^(?:song|sing)\\s*(?:" + PLAY_ACTION + "\\s+)?(.*)$", "i"),
	new RegExp("^(?:gan|gaan|gana|music)\\s+" + PLAY_ACTION + "\\s*(?:ekta\\s+|ta\\s+)?(.*)$", "i"),
	/^(?:গান|গানটা)\s+(?:বাজাও|ছাড়ো|ছাড়|দাও|দে|শোনাও)\s*(.*)$/,
	/^(.+?)\s+(?:gan|gaan|song)\s+(?:chara|chhar|bajao|dao|de)$/i
];
const AI_PREFIX = /^ai[\s-]*(?:song|gan|gaan|music)\b[\s:,-]*/i;
const CREATE_VERB = /\b(?:make|create|generate|compose|banao|banaw|banai|banaiya|bana|likho|likhe)\b/i;
const MUSIC_WORD = /\b(?:song|sing|gan|gaan|gana|music|tune)\b|গান|সুর/i;

/**
 * { mode: "ai", prompt } for "make me a song" requests, { mode: "play", query } for "play this song",
 * null when it is no song request at all. An empty prompt / query means the idea is missing.
 */
function songIntent(text) {
	const t = String(text).replace(/\s+/g, " ").trim();
	if (t.length < 3 || t.length > 300) return null;

	if (AI_PREFIX.test(t)) return { mode: "ai", prompt: t.replace(AI_PREFIX, "").trim() };
	if (MUSIC_WORD.test(t) && CREATE_VERB.test(t)) {
		const lead = t.match(/^(?:gan|gaan|gana|song|music)\s+(?:make|create|generate|banao|banaw|bana)\b[\s:,-]*(.*)$/i);
		return { mode: "ai", prompt: (lead ? lead[1] : t).trim() };
	}
	if (t.length <= 160) {
		for (const re of PLAY_RES) {
			const m = t.match(re);
			if (m) return { mode: "play", query: m[1].replace(/^(?:ekta|ta|ei|oi)\s+/i, "").replace(/[?!.]+$/g, "").trim() };
		}
	}
	return null;
}

/** Hands the song name to the bot's own sing command (top YouTube result, sent as audio). */
async function playSong(ctx, query) {
	const registry = global.GoatBot && global.GoatBot.commands;
	const cmd = registry && (registry.get("sing") || registry.get("song"));
	if (!cmd || typeof cmd.onStart !== "function") return false;
	await cmd.onStart(Object.assign({}, ctx, { args: query.split(/\s+/).filter(Boolean) }));
	return true;
}

const CLOSING_EMOJI = ["🙂", "😊", "😄", "😎"];
const ENDS_WITH_EMOJI = /\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]*\s*$/u;

/** Every answer ends with an emoji: keep the AI's own, add a gentle one only when it forgot. */
function withClosingEmoji(text) {
	if (ENDS_WITH_EMOJI.test(text)) return text;
	return `${text} ${CLOSING_EMOJI[Math.floor(Math.random() * CLOSING_EMOJI.length)]}`;
}

/** 1 = boy, 2 = girl, 0 = unknown. A guess from the profile (src/gender.js), asked once per person, never blocking the chat for long. */
async function guessGender(usersData, uid) {
	try {
		const { resolveGender } = require("../src/gender");
		const found = await Promise.race([resolveGender(usersData, uid), new Promise(resolve => setTimeout(() => resolve(null), 4000))]);
		return found && (found.gender === 1 || found.gender === 2) ? found.gender : 0;
	}
	catch (_) { return 0; }
}

async function chat({ ctx, event, message, usersData, text }) {
	const senderID = String(event.senderID);

	const now = Date.now();
	if (now - (lastAt.get(senderID) || 0) < COOLDOWN_MS) return;
	lastAt.set(senderID, now);

	const day = today();
	const rec = userRec(senderID);
	const who = await identify(usersData, senderID);
	if (who.name) rec.name = who.name;
	if (who.username) rec.username = who.username;
	rec.lastSeen = now;

	if (rec.gender === undefined) rec.gender = await guessGender(usersData, senderID);

	const asked = detectCallName(text);
	if (asked && asked !== rec.callName) { rec.callName = asked; rec.callNameSince = day; }

	const language = pickLanguage(text, rec);
	rec.lang = language;

	// Song requests: a new song from the AI, or an existing song from YouTube.
	const song = songIntent(text);
	if (song && song.mode === "ai") {
		if (!song.prompt) return message.reply("Kon Dhoroner Gan Banabo Idea Bolo..? 🎵");
		return makeAiSong({ api: ctx.api, event, message, prompt: song.prompt });
	}
	if (song && song.mode === "play") {
		if (!song.query) return message.reply("Kon Gan Shunbe Nam Bolo..? 🎵");
		try { if (await playSong(ctx, song.query)) return; }
		catch (error) { console.error("[shihab] play failed:", error && error.message); return message.reply("Gan ta Ekhon Pachchi na Abar Try koro..! 😵"); }
	}

	// Fixed answers: nobody needs the AI for "who is the owner" or "what do you do".
	const kind = cannedKind(text);
	if (kind) return sendCanned({ kind, rec, text, message });
	const prompt = buildPrompt({ rec, text, day, language });
	const tag = rec.username ? `@${rec.username} ` : "";

	let reply;
	try { reply = await askApi(prompt); }
	catch (error) {
		console.error("[shihab] API error:", error.message);
		save();
		return message.reply(tag + (FAIL[language] || FAIL.banglish));
	}
	reply = reply.replace(/^\s*shihab\s*[:：-]\s*/i, "").replace(/^\s*@\S+\s*[,:]?\s*/, "").trim().slice(0, 900);
	if (!reply) return;
	reply = tag + withClosingEmoji(reply);

	// this person's own notes and history only
	const notes = rec.days[day] || (rec.days[day] = []);
	notes.push(shorten(text, NOTE_CHARS));
	if (notes.length > NOTES_PER_DAY) notes.splice(0, notes.length - NOTES_PER_DAY);
	for (const d of Object.keys(rec.days).sort().slice(0, -DAYS_KEPT)) delete rec.days[d];
	if (previousNotes(rec, day)) rec.askedOn = day;

	rec.history.push({ r: "u", t: shorten(text, 200) }, { r: "s", t: shorten(reply, 200) });
	if (rec.history.length > HISTORY_KEPT) rec.history.splice(0, rec.history.length - HISTORY_KEPT);
	rememberReply(reply);
	save();

	return message.reply(reply);
}

function describe(uid) {
	const rec = load().users[String(uid)];
	if (!rec) return "Ami tomake ekhono chini na. Age 'shihab hi' bolo 🙂";
	const lines = ["🧠 Ami tomar bepare ja jani:"];
	if (rec.name) lines.push(`• Naam: ${rec.name}`);
	if (rec.username) lines.push(`• Username: @${rec.username}`);
	if (rec.callName) lines.push(`• Tomake dakbo: ${rec.callName}`);
	if (rec.lang) lines.push(`• Tumi kotha bolo: ${lang.LABELS[rec.lang] || rec.lang}`);
	const dates = Object.keys(rec.days || {}).sort();
	if (dates.length) {
		const last = dates[dates.length - 1];
		lines.push(`• Shesh kotha (${last}): ${(rec.days[last] || []).slice(-2).join(" / ")}`);
	}
	return lines.join("\n");
}

module.exports = {
	config: {
		name: "shihab",
		aliases: ["aimusic", "aisong", "shihabai", "gpt5"],
		version: "1.0",
		author: "CRX Shihab",
		countDown: 3,
		role: 0,
		category: "ai",
		shortDescription: "Chat with Shihab, and make AI songs from your idea",
		guide: {
			en: "shihab <message>  (no prefix needed)\nshihab make a funny Chittagong song / {pn} ai-song <idea> — Shihab makes a song with AI\nshihab gan chara <name> — plays that song from YouTube\n{pn} me — what Shihab remembers about you\n{pn} call <name> — Shihab will call you that\n{pn} forget — wipe your memory"
		}
	},

	onStart: async function (ctx) {
		const { event, args, message, usersData } = ctx;
		const sub = (args[0] || "").toLowerCase();
		const senderID = String(event.senderID);

		// The original aliases keep working: -aimusic <idea> / -aisong <idea> always make a song.
		if (["aimusic", "aisong"].includes(String(ctx.invokedAs || "").toLowerCase())) {
			const prompt = args.join(" ").trim();
			if (!prompt) return message.reply(`🎵 Tell me the song idea.\nExample: ${ctx.prefix || "-"}${ctx.invokedAs} Create a funny Chittagong music`);
			return makeAiSong({ api: ctx.api, event, message, prompt });
		}

		if (sub === "me") return message.reply(describe(senderID));

		if (sub === "forget") {
			delete load().users[senderID];
			save();
			return message.reply("🗑️ Tomar shob kotha bhule gelam.");
		}

		if (sub === "call") {
			const name = cleanName(args.slice(1).join(" "));
			if (!name) return message.reply("Kon naam e dakbo? Example: -shihab call Rafi");
			const rec = userRec(senderID);
			rec.callName = name;
			rec.callNameSince = today();
			save();
			return message.reply(`✅ Thik ache, ekhon theke tomake "${name}" bolbo.`);
		}

		const text = args.join(" ").trim();
		if (!text) return message.reply(ASK[lang.detect(text)] || ASK.banglish);
		return chat({ ctx, event, message, usersData, text });
	},

	onChat: async function (ctx) {
		const { api, event, message, usersData, prefix } = ctx;
		const body = typeof event.body === "string" ? event.body : "";
		try {
			if (String(event.senderID) === String(api.getCurrentUserID && api.getCurrentUserID())) return;
		}
		catch (_) { /* no self id available */ }

		// 1) "shihab <message>" typed in the chat
		const m = body.match(/^\s*(?:shihab|শিহাব|शिहाब)(?=[\s,:!.\-–—]|$)[\s,:!.\-–—]*([\s\S]*)$/i);
		if (m) {
			const text = m[1].trim();
			if (!text) return message.reply(ASK.banglish);
			return chat({ ctx, event, message, usersData, text });
		}

		// 2) a swipe-reply to one of Shihab's own messages - the chat just continues
		if (isReplyToShihab(event, api, prefix)) return chat({ ctx, event, message, usersData, text: body.trim() });
	}
};
