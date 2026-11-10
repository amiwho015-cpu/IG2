"use strict";

/**
 * Abuse guard helpers: does a message insult the bot, and is it aimed at the bot?
 * Used by events/onAbuse.js. The word list covers English, Bangla (Banglish spelling) and Hindi
 * (Hinglish spelling) insults; add more words in config.json -> abuse.extraWords.
 */

// Whole-word insults (matched on word boundaries, after normalising letters).
const WORDS = [
	// English
	"fuck", "fucker", "fucking", "fuk", "fck", "motherfucker", "mofo", "bitch", "bastard", "asshole", "dickhead", "slut", "whore", "cunt", "retard",
	// Hindi / Urdu (romanised)
	"madarchod", "madarchodh", "maderchod", "behenchod", "bhenchod", "benchod", "bhosdike", "bhosdi", "bhosda", "chutiya", "chutiye", "chutia", "gandu", "gaandu", "lund", "lauda", "lawda", "harami", "haramzada", "haramjada", "kamina", "kutte", "kuttiya", "randi",
	// Bangla (romanised)
	"magi", "maggi", "magir", "khanki", "khankir", "khankirpola", "bokachoda", "bokacoda", "bal", "baler", "chudir", "chudirbhai", "chodna", "chodon", "gaadha", "shuorer", "shuor", "suorer", "kuttar", "kuttarbaccha", "haramjadi", "haramir", "tor ma", "tor mare", "tor baper", "chud", "chod", "choda", "chudbo", "mc", "bc", "mf", "mkc", "bkl", "bsdk"
];

// Phrases (substring match on the normalised text).
const PHRASES = [
	"motherchod", "mother chod", "madar chod", "behen chod", "bhen chod", "tor ma ke", "tor mar", "toke chudi", "tor baper", "teri maa", "teri ma ki", "maa ki chut", "kutta kamina", "kuttar bachcha", "kuttar bacha", "shuorer bachcha", "shuorer baccha", "go fuck", "fuck you", "fuck off", "son of a bitch", "mother fucker"
];

// Short / ambiguous words: only counted when they stand alone in a short message ("tui chod", "bc bot").
const SOFT = new Set(["chod", "choda", "chud", "bal", "mc", "bc", "mf"]);

function normalise(text) {
	let t = String(text || "").toLowerCase();
	// leetspeak / masking: f*ck, f.u.c.k, m@darchod, ch0d ...
	t = t.replace(/[@4]/g, "a").replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/\$/g, "s").replace(/\*/g, "u");
	t = t.replace(/(.)\1{2,}/g, "$1$1");          // loooool -> lool
	t = t.replace(/[^\p{L}\p{N}\s]/gu, " ");      // punctuation -> space
	return t.replace(/\s+/g, " ").trim();
}

/** The insulting word/phrase found in `text`, or null. */
function findAbuse(text, extraWords) {
	const t = normalise(text);
	if (!t) return null;
	const squashed = t.replace(/\s/g, "");
	for (const p of PHRASES) if (t.includes(p)) return p;
	const words = new Set(t.split(" "));
	for (const w of WORDS) {
		if (w.includes(" ")) { if (t.includes(w)) return w; continue; }
		if (SOFT.has(w)) continue;                // too common inside other words / commands: handled below
		if (words.has(w)) return w;
	}
	// strong stems that stay insults even when glued to other letters ("motherchodtui", "madarchodbot")
	for (const stem of ["motherchod", "madarchod", "behenchod", "bhenchod", "bokachoda", "khankirpola", "chutiya", "motherfuck", "bhosdike"]) if (squashed.includes(stem)) return stem;
	// "soft" words only count when they stand alone in a short message ("tui chod", "bc bot")
	if (words.size <= 4) for (const w of SOFT) if (words.has(w)) return w;
	for (const w of Array.isArray(extraWords) ? extraWords : []) {
		const x = normalise(w);
		if (x && (words.has(x) || (x.includes(" ") && t.includes(x)))) return x;
	}
	return null;
}

module.exports = { normalise, findAbuse };
