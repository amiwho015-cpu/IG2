"use strict";

/** -diag : one message with everything needed to debug the bot (no secrets). Reply to a message to test reply targets. */
module.exports = {
	config: {
		name: "diag",
		aliases: ["status", "debug", "ping2"],
		author: "InstaBOT",
		category: "system",
		cooldown: 5,
		role: 0,
		description: { en: "Bot health: build, login, polling, rate-limit and reply-target check" },
		usage: { en: "{p}diag  (reply to someone's message to test reply targets)" }
	},

	onStart: async function ({ message, event, api }) {
		const d = typeof api.getDiagnostics === "function" ? api.getDiagnostics() : {};
		const ts = Number(event.timestamp) || 0;
		const sentMs = ts > 1e15 ? ts / 1000 : ts > 1e12 ? ts : ts * 1000;
		const lag = sentMs ? Math.max(0, Date.now() - sentMs) : null;
		const up = global.instabotStartedAt ? Math.round((Date.now() - global.instabotStartedAt) / 60000) : null;
		const r = event.messageReply;
		const lines = [
			"🩺 DIAG  (build instachat-5)",
			`mode: ${(global.GoatBot && global.GoatBot.config && global.GoatBot.config.server && global.GoatBot.config.server.mode) || "instachat"}`,
			`bot: @${d.username || "?"} (${d.userId || "?"})`,
			`uptime: ${up == null ? "?" : up + " min"}`,
			`message lag: ${lag == null ? "?" : Math.round(lag / 1000) + "s"}`,
			`polling: ${d.pollRunning ? "on" : "OFF"}, delay ${d.pollDelayMs || "?"} ms, errors ${d.pollErrors == null ? "?" : d.pollErrors}`,
			`lookups: ${d.lookupPausedForSec ? "PAUSED " + d.lookupPausedForSec + "s (Instagram 429)" : "ok"}`,
			`cache: ${d.cachedProfiles || 0} profiles, ${d.cachedThreads || 0} threads, ${d.knownMessages || 0} messages`,
			r ? `reply target: ${r.senderID ? "✅ " + r.senderID : "❌ sender unknown"} | quoted: "${String(r.body || "").slice(0, 40)}"` : "reply target: (reply to a message with -diag to test)"
		];
		return message.reply(lines.join("\n"));
	}
};
