"use strict";

/**
 * abuseGuard — group abuse filter.
 *   1st abusive message -> unsend + react ❌ + warning (1/2)
 *   2nd abusive message -> unsend + react ❌ + warning (2/2)
 *   3rd abusive message -> unsend + react ❌ + remove from group (ban) with reason
 *
 * Counts are stored per thread in threadsData ("abuseWarn"), per sender.
 * Bot admins and the bot itself are never checked.
 */

const WARN_LIMIT = 2;                       // warnings before the ban
const BAN_REASON = "you are biggest motherchod";

// Edit this list freely. Matched as whole words, case-insensitive.
const BAD_WORDS = [
	"motherchod", "motherchoda", "madarchod", "maderchod", "mc", "bc",
	"chod", "chudi", "chuda", "bokachoda", "bokachuda", "magi", "khanki",
	"harami", "fuck", "fucker", "bitch"
];
const BAD_RE = new RegExp(`(^|[^a-z])(${BAD_WORDS.join("|")})([^a-z]|$)`, "i");

function isAbusive(text) {
	return !!text && BAD_RE.test(String(text).toLowerCase());
}

module.exports = {
	config: {
		name: "abuseGuard",
		category: "system",
		eventType: ["message", "message_reply"]
	},

	onEvent: async function ({ api, event, threadsData, usersData, config }) {
		const body = event.body || "";
		if (!isAbusive(body)) return;

		const senderID = String(event.senderID || "");
		const threadID = event.threadID;
		if (!senderID || !threadID) return;
		if (config && Array.isArray(config.adminBot) && config.adminBot.includes(senderID)) return;
		if (senderID === String(api.getCurrentUserID())) return;

		const react = emoji => Promise.resolve(api.setMessageReaction(emoji, event.messageID)).catch(() => { });
		const unsend = () => Promise.resolve(api.unsendMessage(event.messageID, threadID)).catch(() => { });

		// Per-thread warn table: { [senderID]: count }
		// Events get the raw database: get(id) / set(id, patch) take no path argument.
		const thread = threadsData.ensure(threadID, {}) || {};
		const table = Object.assign({}, thread.abuseWarn || {});
		const count = (Number(table[senderID]) || 0) + 1;
		table[senderID] = count;
		threadsData.set(threadID, { abuseWarn: table });

		await unsend();
		await react("❌");

		if (count <= WARN_LIMIT) {
			return api.sendMessage(
				`⚠️ Gali dish na. Warning ${count}/${WARN_LIMIT}. Ar ekbar korle bot theke ban kora hobe.`,
				threadID
			);
		}

		// Third offence: remove and reset the counter for this person.
		delete table[senderID];
		threadsData.set(threadID, { abuseWarn: table });

		// Bot-level ban, same storage as the `ban` command: they can no longer use the bot.
		try {
			usersData.ensure(senderID, { userID: senderID });
			usersData.update(senderID, { banned: { status: true, reason: BAN_REASON, date: Date.now() } });
			return api.sendMessage(`🚫 ${senderID} ke bot theke ban kora holo.\nReason: ${BAN_REASON}`, threadID);
		}
		catch (error) {
			return api.sendMessage(`⚠️ ${senderID} ke ban kora jayni: ${(error && error.message) || error}`, threadID);
		}
	}
};
