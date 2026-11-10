"use strict";

/**
 * onAbuse — warning system for people who swear at the bot.
 *
 * A message counts when it insults AND is aimed at the bot:
 *   - a reply to one of the bot's messages,
 *   - it names/@tags the bot (botName, "nix", its @username),
 *   - or it is a prefixed command (-nix <insult>, -ai <insult> ...).
 * Strike 1..warnLimit  -> the bot warns the person ("Warning 1/2 ...").
 * Next strike          -> the person is banned from the bot (reason in config.abuse.reason).
 * Bot admins are never warned. Settings: config.json -> "abuse". Reset: -abuse reset <reply|id>.
 */

const log = require("../src/logger");
const { findAbuse } = require("../src/abuseGuard");

const lastWarnAt = new Map();

function botNames(api, config) {
	const names = new Set(["nix"]);
	if (config && config.botName) names.add(String(config.botName).toLowerCase());
	try { const u = api && api.client && api.client.username; if (u) names.add(String(u).toLowerCase()); } catch (_) { /* optional */ }
	return [...names].filter(n => n && n.length >= 3);
}

function aimedAtBot(event, api, config, body) {
	let botID = "";
	try { botID = String(api.getCurrentUserID()); } catch (_) { /* no id */ }
	if (event.messageReply && event.messageReply.senderID && botID && String(event.messageReply.senderID) === botID) return true;
	if (config.prefix && body.startsWith(config.prefix)) return true;
	const low = body.toLowerCase();
	if (/(^|[^a-z0-9])(bot|nix|বট)([^a-z0-9]|$)/i.test(low)) return true;   // "tui bot ta magi"
	if (botID && event.mentions && Object.prototype.hasOwnProperty.call(event.mentions, botID)) return true;
	return botNames(api, config).some(n => new RegExp(`(^|[^a-z0-9])@?${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(low));
}

module.exports = {
	config: {
		name: "onAbuse",
		category: "system",
		eventType: ["message", "message_reply"]
	},

	onEvent: async function ({ api, event, message, usersData, userData, config, role }) {
		const cfg = (config && config.abuse) || {};
		if (cfg.enable === false) return;
		if (event.isSelf) return;
		const body = typeof event.body === "string" ? event.body.trim() : "";
		if (!body) return;
		const senderID = String(event.senderID || event.userID || "");
		if (!senderID) return;
		try { if (senderID === String(api.getCurrentUserID())) return; } catch (_) { /* ignore */ }
		if (role >= 2) return;                                   // bot admins are never warned
		if (userData && userData.banned && userData.banned.status) return;
		if (Array.isArray(cfg.threadIDs) && cfg.threadIDs.length && !cfg.threadIDs.map(String).includes(String(event.threadID))) return;

		// "-chudi @x": the command name itself is not an insult, only what follows it.
		let text = body;
		if (config.prefix && body.startsWith(config.prefix)) text = body.slice(config.prefix.length).trim().split(/\s+/).slice(1).join(" ");
		if (!text) return;

		const hit = findAbuse(text, cfg.extraWords);
		if (!hit) return;
		if (!aimedAtBot(event, api, config, body)) return;

		// one warning per message burst (same person within 4s counts once)
		const now = Date.now();
		if (now - (lastWarnAt.get(senderID) || 0) < 4000) return;
		lastWarnAt.set(senderID, now);

		const limit = cfg.warnLimit || 2;
		const rec = (userData && userData.abuse) || { warns: 0 };
		const warns = Number(rec.warns) || 0;
		const name = (userData && userData.name) || (userData && userData.username && `@${userData.username}`) || "tui";

		if (warns >= limit) {
			const reason = cfg.reason || "you are biggest motherchod";
			usersData.update(senderID, {
				banned: { status: true, reason, date: now },
				abuse: { warns: warns + 1, last: now, bannedForAbuse: true }
			});
			log.warn("ABUSE", `${senderID} banned for abuse in ${event.threadID}: "${hit}"`);
			try { await message.react("🚫"); } catch (_) { /* optional */ }
			return message.reply(`🚫 𝗕𝗔𝗡𝗡𝗘𝗗\n━━━━━━━━━━━━━━━━━━\n${name}, tore ${limit} bar warning dilam, tao gali dili.\nAr ${config.botName || "bot"} use korte parbi na.\n📝 Reason: ${reason}`);
		}

		const next = warns + 1;
		usersData.update(senderID, { abuse: { warns: next, last: now } });
		log.warn("ABUSE", `${senderID} warned ${next}/${limit} in ${event.threadID}: "${hit}"`);
		try { await message.react("⚠️"); } catch (_) { /* optional */ }
		const left = limit - next;
		return message.reply(
			`⚠️ 𝗪𝗔𝗥𝗡𝗜𝗡𝗚 ${next}/${limit}\n━━━━━━━━━━━━━━━━━━\n${name}, bot ke gali dio na!\n` +
			(left > 0 ? `Ar ${left} bar korle sudhu warning, tarpor ban hoye jabi.` : `Eita shesh warning. Abar gali dile ban hobi 🚫`)
		);
	}
};
