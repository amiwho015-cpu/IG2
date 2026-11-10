"use strict";

/**
 * welcard / welcome — preview the welcome card (toshiro canvas API) for yourself or someone else.
 * New members get the same card automatically (config.json -> welcome.card).
 *
 * Author: Shihab
 */

const fs = require("fs");
const { make } = require("../src/welcomeCard");
const { targetOf } = require("../src/cardUtil");

function create(name, kind, aliases) {
	return {
		config: {
			name,
			aliases,
			version: "1.0",
			author: "Shihab",
			countDown: 8,
			role: 0,
			category: "image",
			shortDescription: { en: `Welcome card (${kind}) for you or a tagged person` },
			guide: { en: "{pn} → card for you\nReply to a message with {pn} or {pn} @user → card for that person" }
		},

		onStart: async function ({ api, event, args, message, threadsData }) {
			const uid = (await targetOf(event, args, api)) || String(event.senderID);
			const card = await make({ api, threadID: event.threadID, uid, kind, timeout: 45000 });
			if (!card) return message.reply(`❌ ${name} card toiri hoy nai, pore abar try koro.`);
			return message.reply({ body: `👋 Welcome ${card.name}!`, attachment: fs.createReadStream(card.file) });
		}
	};
}

module.exports = create("welcard", "welcard", ["welcomecard"]);
