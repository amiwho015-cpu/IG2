"use strict";

/**
 * nixLang — tells Nix which language a message is in, and gives the chat model a
 * short guide so it understands AND answers in the same one.
 *
 * Understood: Bangla (script), Banglish (Bangla in English letters), Hindi (Devanagari),
 * Hinglish (Hindi in English letters), Chittagonian / Chatgaiya ("ctg", script or Roman)
 * and plain English.
 *
 * Detection is only a hint (a few word lists); the model gets the full guide either way,
 * so a wrong guess never breaks a reply.
 */

const BANGLA_SCRIPT = /[\u0980-\u09FF]/g;
const DEVANAGARI = /[\u0900-\u097F]/g;

// Chittagonian words that differ from standard Bangla / Banglish.
const CTG_ROMAN = new Set([
	"kita", "kitta", "kila", "keda", "kede", "kot", "koit", "koito", "kodde", "kone", "ide", "ede", "oide", "ekkhoin", "ekhoin",
	"goros", "goroi", "gorer", "gorim", "gorda", "gori", "gorey", "zaim", "jaim", "zaiyum", "jaiyum", "khaim", "khaiyum", "khaibo",
	"bala", "fua", "fui", "fuya", "fuyar", "ghorot", "bazarot", "ara", "aira", "aiya", "aiyyo", "oiyyo", "oiyyer", "oiyo", "oiba", "oibo",
	"tuyi", "tuyar", "tuar", "ayar", "aar", "aarar", "ashi", "asoin", "aso", "hunor", "hunon", "doiko", "koiyo", "koyum", "koim",
	"nafari", "nafarim", "nafar", "haila", "oila", "lagey", "lager", "dekhim", "dekhoi", "bujhoin", "bujoin", "ghoro", "doro", "ayre"
]);
const CTG_BANGLA = [
	"কিতা", "কিত্তা", "কিলা", "কেডা", "কডে", "কোডে", "কনে", "ইডে", "এক্কুন", "গরস", "গরের", "গরি", "গইজ্জে", "জাইম", "জাইয়ুম", "খাইম",
	"খাইয়ুম", "বালা", "ফুয়া", "ফুঁই", "ফুইয়া", "ঘরত", "বাজারত", "আঁরা", "আরা", "তোঁরা", "তুঁই", "তুই কিতা", "আঁই", "আঁর", "তোঁর",
	"অইয়ে", "অইব", "অইবো", "না ফারি", "ফারি", "লাগের", "কইয়ুম", "দেখিম"
];

const HINGLISH = new Set([
	"hai", "hain", "nahi", "nahin", "kya", "kyun", "kyu", "kaise", "kaisa", "kaisi", "mera", "meri", "mujhe", "mujhko", "tum", "tumhe",
	"tumhara", "aap", "apka", "aapka", "bhai", "yaar", "acha", "accha", "theek", "thik", "karo", "karna", "kar", "raha", "rahi",
	"rahe", "hoon", "hu", "ho", "abhi", "kal", "aaj", "bahut", "bohot", "bhot", "kuch", "koi", "sab", "kaun", "kahan", "kidhar",
	"chal", "chalo", "bolo", "bol", "suno", "dekho", "samajh", "pata", "matlab", "wala", "wali", "lekin", "par", "aur", "toh", "bas",
	"bhi", "mat", "chahiye", "tha", "thi", "the", "hoga", "karunga", "karungi", "milega", "dost", "zindagi", "pyar"
]);

const BANGLISH = new Set([
	"ami", "tumi", "tui", "apni", "amar", "tomar", "tor", "tora", "amra", "ki", "keno", "kemon", "kothay", "kothai", "kobe", "kokhon",
	"ke", "kara", "koto", "kon", "ache", "achi", "achis", "achho", "nai", "na", "nei", "hobe", "hoise", "hoyeche", "hoy", "holo",
	"koro", "kor", "korbo", "korbi", "korchi", "korcho", "korcis", "bolo", "bol", "bolbo", "bolchi", "dekho", "dekh", "jabo", "jabi",
	"jai", "ashbo", "asbo", "khabo", "khaisi", "kheyechi", "bhalo", "valo", "bhai", "dost", "ekhon", "pore", "age", "kal", "kalke",
	"aj", "ajke", "ekta", "ekdom", "onek", "khub", "kintu", "tai", "ar", "r", "o", "eta", "ota", "oi", "ei", "tahole", "mone", "pagol",
	"bondhu", "jaan", "shona", "naam", "nam", "bujhi", "bujhlam", "janina", "jani", "lagbe", "dorkar", "pari", "parbo", "thik", "thak"
]);

const tokens = text => String(text || "").toLowerCase().match(/[a-z']+/g) || [];

function count(words, set) {
	let n = 0;
	for (const w of words) if (set.has(w)) n++;
	return n;
}

/** -> "ctg" | "bn" | "hi" | "hinglish" | "banglish" | "en" */
function detect(text) {
	text = String(text || "");
	const bn = (text.match(BANGLA_SCRIPT) || []).length;
	const hi = (text.match(DEVANAGARI) || []).length;

	if (bn || hi) {
		if (hi > bn) return "hi";
		return CTG_BANGLA.some(w => text.includes(w)) ? "ctg" : "bn";
	}

	const words = tokens(text);
	if (!words.length) return "en";
	const ctg = count(words, CTG_ROMAN);
	const hin = count(words, HINGLISH);
	const ban = count(words, BANGLISH);

	// Chittagonian words are rare in standard Banglish, so 2 of them (or 1 + Banglish context) is enough.
	if (ctg >= 2 || (ctg >= 1 && ban >= 2 && ctg >= hin)) return "ctg";
	if (hin >= 2 && hin > ban) return "hinglish";
	if (ban >= 1 && ban >= hin) return ban >= 2 || words.length <= 3 ? "banglish" : "banglish";
	if (hin >= 1) return "hinglish";
	return "en";
}

const LABELS = {
	ctg: "Chittagonian (Chatgaiya) dialect of Bangla",
	bn: "Bangla (Bengali script)",
	hi: "Hindi (Devanagari script)",
	hinglish: "Hinglish (Hindi written in English letters)",
	banglish: "Banglish (Bangla written in English letters)",
	en: "English"
};

// Short Chittagonian -> standard Bangla cheat-sheet so the model understands it correctly.
const CTG_GLOSSARY =
	"Chittagonian cheat-sheet (ctg = standard Bangla): ai/ayi/ui = ami (I); tuyi/tui = tumi/tui (you); ara = amra (we); " +
	"tora = tomra; kita = ki (what); kila = kemon (how); keda = ke (who); kot/koito/kodde = kothay (where); ekkhoin = ekhon (now); " +
	"goros/gorer = korcho/korcis (doing); gori/gorim = kori/korbo; zaim/jaim = jabo; khaim = khabo; koyum = bolbo; " +
	"bala = bhalo (good); fua = chele (boy); fui = meye (girl); ghorot = ghore (at home); oibo = hobe; oiyyo/oiyyer = hoise/hoyeche; " +
	"nafari/na fari = parina (can't); lagey/lager = lage; ashi/aso = achi/acho. " +
	"Example: \"tuyi kita gorer?\" = \"tui ki korcish?\"; \"kila aso?\" = \"kemon acho?\".";

const REPLY_STYLE = {
	ctg: "Reply in the same Chittagonian style (use words like kita, kila, tuyi, ai, goros, bala, zaim), in the same script the person used. Keep it friendly and understandable.",
	bn: "Reply in natural Bangla using Bengali script.",
	hi: "Reply in natural Hindi using Devanagari script.",
	hinglish: "Reply in Hinglish (Hindi in English letters), same casual style.",
	banglish: "Reply in Banglish (Bangla in English letters), same casual style.",
	en: "Reply in English (you may add a little Banglish flavour if they do)."
};

/** Prompt text: what the person wrote in + how Nix should answer. */
function guide(lang) {
	const key = LABELS[lang] ? lang : "en";
	return [
		"You understand Bangla, Banglish, Hindi, Hinglish, Chittagonian (ctg) and English perfectly, even with spelling mistakes, mixed languages and slang.",
		`This message looks like: ${LABELS[key]}. ${REPLY_STYLE[key]}`,
		"If the person mixes languages, answer in the language they used most. If they clearly ask for another language, use that one.",
		CTG_GLOSSARY
	].join(" ");
}

const FAIL = {
	ctg: "😵 ekkhoin ekta jhamela oiyyo, abar ko.",
	bn: "😵 একটু সমস্যা হচ্ছে, আবার বলো।",
	hi: "😵 Thodi problem aa gayi, phir se bolo.",
	hinglish: "😵 Thodi problem aa gayi, phir se bolo.",
	banglish: "😵 Ektu problem hocche, abar bolo.",
	en: "😵 Something went wrong, please try again."
};

const ASK = {
	ctg: "Bol, kita koibo? 🙂",
	bn: "বলো, কী বলবে? 🙂",
	hi: "Bolo, kya bolna hai? 🙂",
	hinglish: "Bolo, kya bolna hai? 🙂",
	banglish: "Bolo, ki bolbi? 🙂",
	en: "Go on, what do you want to say? 🙂"
};

module.exports = { detect, guide, LABELS, FAIL, ASK };
