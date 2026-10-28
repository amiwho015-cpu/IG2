// ========================================
// CHAT HANDLER v2 (replace the old onChat completely)
// Paste at the END of baby.js, after GREET_REPLY
// ========================================

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function sendWithReplyHook(api, event, text) {
    return api.sendMessage(
        text,
        event.threadID,
        (error, info) => {
            if (info) {
                global.GoatBot.onReply.set(info.messageID, {
                    commandName: "baby",
                    type: "reply",
                    messageID: info.messageID,
                    author: event.senderID
                });
            }
        },
        event.messageID
    );
}

// 1 = female, 2 = male, null = unknown
async function getGender(api, usersData, uid) {
    try {
        const u = await usersData.get(uid);
        if (u?.gender === 1 || u?.gender === 2) return u.gender;
    } catch {}

    try {
        const info = await api.getUserInfo(uid);
        const g = info?.[uid]?.gender;
        if (g === 1 || g === "female" || g === "FEMALE") return 1;
        if (g === 2 || g === "male" || g === "MALE") return 2;
    } catch {}

    return null;
}

const salamWords = [
    "salam", "slm", "assalamualaikum", "assalamu alaikum",
    "asalamualaikum", "assalamu", "আসসালামু", "সালাম",
    "আসসালামুয়ালাইকুম", "আসসালামু আলাইকুম"
];

const hiWords = [
    "hi", "hii", "hiii", "hello", "hlw", "hlo", "helo",
    "hey", "হাই", "হ্যালো", "হেলো"
];

const SALAM_GIRL = [
    "ওয়ালাইকুম আসসালাম 🤲💗 আপনি আসতেই group টা আলো হয়ে গেল! 🙈✨",
    "ওয়ালাইকুম আসসালাম 🌸 এত সুন্দর করে সালাম দিলে তো মনটাই ভালো হয়ে যায়! 😚",
    "ওয়ালাইকুম আসসালাম আপু/ম্যাডাম 🥰 আজকে একটু বেশিই cute লাগছে মনে হচ্ছে! 😏💞",
    "ওয়ালাইকুম আসসালাম ❤️ আপনি আসছেন শুনে Baby এর charge ১০০% হয়ে গেছে! 🔋😂"
];

const SALAM_BOY = [
    "ওয়ালাইকুম আসসালাম ভাই 🤲😄 কি খবর, আজ কোন নতুন গুজব নিয়ে আসছো?",
    "ওয়ালাইকুম আসসালাম 😎 ভাই, খাওয়াদাওয়া হইছে নাকি না খেয়েই group এ ঢুকছো? 😂",
    "ওয়ালাইকুম আসসালাম বস 🤝 আজকে কার সাথে ঝগড়া করবা?",
    "ওয়ালাইকুম আসসালাম ভাইজান 😂 এতদিন কই ছিলা, group তো তোমাকে ছাড়া চলতেই পারে না!"
];

const SALAM_NEUTRAL = [
    "ওয়ালাইকুম আসসালাম 🤲😊 কেমন আছো?",
    "ওয়ালাইকুম আসসালাম 🌸 কি খবর, সব ঠিকঠাক?"
];

const HI_REPLY = [
    "hi না বলে boss রে একটা GF দে! 😈🔥",
    "hello না বলে boss রে GF দে! 😈❤️",
    "hi hello পরে, আগে boss রে একটা GF দে! 😈😂"
];

function normalizeText(s) {
    return s
        .toLowerCase()
        .replace(/[!?.,।~'"`]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function isSalam(t) {
    if (t.length > 40) return false;
    return salamWords.some(w => t.includes(w));
}

function isHi(t) {
    return hiWords.includes(t);
}

module.exports.onChat = async ({ api, event, usersData }) => {
    try {
        const raw = (event.body || "").trim();
        if (!raw) return;

        // Ignore bot's own messages
        if (event.senderID === api.getCurrentUserID()) return;

        // Ignore prefixed commands (they go to onStart)
        const prefix = global.GoatBot?.config?.prefix;
        if (prefix && raw.startsWith(prefix)) return;

        const text = normalizeText(raw);
        const firstWord = text.split(" ")[0];

        // Remove trigger word if message begins with one ("baby hi")
        const rest = triggers.includes(firstWord)
            ? text.slice(firstWord.length).trim()
            : text;

        // ---------- SALAM ----------
        if (isSalam(rest || text)) {
            const gender = await getGender(api, usersData, event.senderID);

            const reply =
                gender === 1 ? pickRandom(SALAM_GIRL) :
                gender === 2 ? pickRandom(SALAM_BOY) :
                pickRandom(SALAM_NEUTRAL);

            return sendWithReplyHook(api, event, reply);
        }

        // ---------- HI / HELLO ----------
        if (isHi(rest || text)) {
            return sendWithReplyHook(api, event, pickRandom(HI_REPLY));
        }

        // Everything below needs a trigger word
        if (!triggers.includes(firstWord)) return;

        // Only trigger word
        if (!rest) {
            if (firstWord === "shihab") {
                return sendWithReplyHook(api, event, pickRandom(shihabPraises));
            }
            return sendWithReplyHook(
                api,
                event,
                pickRandom([
                    "হ্যাঁ বলো! 😚❤️",
                    "বলো জান, শুনছি 🥰",
                    "ডাকলে কেন? 😏💗",
                    "আমি এখানেই আছি 🫶"
                ])
            );
        }

        // Anything about Shihab
        if (/shihab|শিহাব/i.test(rest)) {
            return sendWithReplyHook(api, event, pickRandom(shihabPraises));
        }

        // Normal chat via API
        const data = await fetchWithFallback(
            `/baby?text=${encodeURIComponent(rest)}` +
            `&senderID=${event.senderID}` +
            `&threadID=${event.threadID}&font=1`
        );

        return sendWithReplyHook(api, event, utils.monospace(data.reply));

    } catch (err) {
        console.error("baby onChat error:", err);
    }
};
