"use strict";

/**
 * onJoin — greet people who are added to a group thread.
 *
 * Configure in config.json:
 *   "welcome": {
 *     "enable": true,
 *     "message": "Welcome %1 to %2! 👋",   // %1 = user, %2 = thread name
 *     "selfMessage": "Thanks for inviting me to %2 💋. Type {prefix}help to see all available commands.",
 *     "threadIDs": [],                       // empty = every thread
 *     "card": "welcard",                     // picture sent with the text: "welcard" | "welcome" | false
 *     "fallbackScan": true                   // also notice new members by watching the member list
 *   }
 *
 * When the BOT ITSELF is the one added, it does not welcome itself: it thanks
 * the inviter with `selfMessage` ({prefix} is the live command prefix, %2 the
 * group name).
 *
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const log = require("../src/logger");
const state = require("../src/welcomeState");
const fs = require("fs");

function fill(template, values) {
	return String(template).replace(/%(\d+)/g, (match, index) => {
		const value = values[Number(index) - 1];
		return value == null ? "" : String(value);
	});
}

module.exports = {
	config: {
		name: "onJoin",
		category: "system",
		eventType: "join",
		description: { en: "Welcome members added to a group thread" }
	},

	onEvent: async function ({ api, event, message, config, threadsData }) {
		const settings = config.welcome || {};
		if (settings.enable === false) return;

		const threadID = event.threadID;
		if (Array.isArray(settings.threadIDs) && settings.threadIDs.length &&
			!settings.threadIDs.map(String).includes(String(threadID))) return;

		// Instagram's action_log carries the affected member as an @handle in
		// `usernames`; some payloads also carry numeric ids. Greet by USERNAME,
		// not the numeric id, so the welcome reads "@someone" rather than a long
		// number.
		//
		// `senderID`/`userID` in a membership event is the ACTOR (who added the
		// member), NOT the member — using it as a fallback greeted the actor as
		// well. Only `participantID`/`userIDs` name the affected member.
		const usernames = Array.isArray(event.usernames) ? event.usernames.map(String).filter(Boolean) : [];
		const ids = (event.userIDs && event.userIDs.length
			? event.userIDs
			: (event.participantID ? [event.participantID] : []))
			.filter(Boolean).map(String);

		if (!usernames.length && !ids.length) {
			log.warn("JOIN", `join event without any member, nothing to welcome: ${JSON.stringify(event).slice(0, 300)}`);
			return;
		}

		const thread = threadsData.get(threadID) || {};
		let threadName = thread.name;
		if (!threadName) {
			try {
				const info = await new Promise((resolve, reject) =>
					api.getThreadInfo(threadID, (error, result) => error ? reject(error) : resolve(result)));
				threadName = info && (info.name || (info.threadName));
				if (threadName) threadsData.update(threadID, { name: threadName });
			}
			catch (_) { /* name is optional */ }
		}

		// The bot's own id, so an invite of the bot is not treated as a member to
		// welcome. The action_log often lists the bot here when IT was added.
		let selfID = null;
		try {
			selfID = String(api.getCurrentUserID() || api._userID || "") || null;
		}
		catch (_) { selfID = null; }
		const selfHandles = new Set();
		try {
			const info = selfID ? await new Promise((resolve) =>
				api.getUserInfo(selfID, (error, result) => resolve(error ? null : result))) : null;
			const self = info && info[selfID];
			if (self && (self.vanity || self.username)) selfHandles.add(String(self.vanity || self.username).toLowerCase());
		}
		catch (_) { /* best effort */ }

		const isSelf = (target) =>
			(selfID && target.userID && String(target.userID) === selfID) ||
			(target.username && selfHandles.has(String(target.username).replace(/^@/, "").toLowerCase()));

		// One entry per affected member: a known handle when we have one, else
		// the numeric id to be resolved to a username below.
		const targets = [];
		for (const name of usernames) targets.push({ username: name, userID: null });
		for (const id of ids) {
			if (targets.some(t => t.userID === id)) continue;
			// Skip an id whose username we already have from the same event only
			// when they are provably the same member; otherwise keep both and
			// dedupe after resolving.
			targets.push({ username: null, userID: id });
		}
		if (!targets.length) return;

		// If the bot itself was added, thank the inviter; do not welcome the bot.
		const selfTargets = targets.filter(isSelf);
		const memberTargets = targets.filter(t => !isSelf(t));
		if (selfTargets.length && !state.recently(threadID, "__bot__")) {
			const selfTemplate = settings.selfMessage ||
				"Thanks for inviting me to %2 💋. Type {prefix}help to see all available commands.";
			const text = fill(selfTemplate, [null, threadName || "this group"])
				.replace(/\{prefix\}/g, String(config.prefix == null ? "-" : config.prefix));
			try {
				await message.send(text);
			}
			catch (error) {
				log.warn("JOIN", `Could not thank the inviter: ${error.message}`);
			}
		}
		if (!memberTargets.length) return;

		const custom = thread.data && thread.data.welcomeMessage;
		if (thread.data && thread.data.welcomeOff === true) return;
		let template = (custom || settings.message || "Welcome %1 to %2! 👋")
			.replace(/\{userName(Tag)?\}/gi, "%1").replace(/\{boxName\}/gi, "%2");
		// A saved message without the member placeholder would greet nobody by name:
		// put the @mention at the start so the new member is always tagged.
		if (!/%1/.test(template)) template = "%1 " + template;
		const seen = new Set();

		for (const target of memberTargets) {
			let username = target.username;
			let display = null;

			// Resolve a numeric id to its username so the greet never shows an id.
			if (!username && target.userID) {
				try {
					const info = await new Promise((resolve, reject) =>
						api.getUserInfo(target.userID, (error, result) => error ? reject(error) : resolve(result)));
					const profile = info && info[target.userID];
					username = (profile && (profile.vanity || profile.username)) || null;
					display = profile && (profile.name || profile.firstName) || null;
				}
				catch (_) { /* fall back below */ }
			}

			// Prefer the username; keep the full name only as a last resort so a
			// lookup that returns nothing still greets a human rather than a number.
			const handle = username ? "@" + String(username).replace(/^@/, "") : null;
			const mention = handle || display || target.userID;
			if (!mention) continue;
			if (seen.has(mention)) continue;
			seen.add(mention);

			// Same member greeted a moment ago (double event / scan) -> skip.
			if (state.recently(threadID, target.userID, username)) continue;

			const text = fill(template, [mention, threadName || "our group"]);

			// Optional picture (toshiro canvas welcard / welcome); text alone when it fails.
			let card = null;
			if (settings.card !== false) {
				try {
					let uid = target.userID;
					if (!uid && username) {
						const { resolveUserTarget } = require("../src/utils");
						const t = await resolveUserTarget([String(username).replace(/^@/, "")], null, api).catch(() => null);
						uid = t && t.id ? String(t.id) : null;
					}
					card = await require("../src/welcomeCard").make({
						api, threadID, uid, threadsData,
						kind: settings.card === "welcome" ? "welcome" : "welcard", timeout: 20000
					});
				}
				catch (_) { card = null; }
			}

			try {
				if (card && card.file) await message.send({ body: text, attachment: fs.createReadStream(card.file) });
				else await message.send(text);
			}
			catch (error) {
				log.warn("JOIN", `Could not welcome ${mention}: ${error.message}`);
				try { if (card) await message.send(text); } catch (_) { /* give up */ }
			}
		}
	}
};
