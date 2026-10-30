"use strict";

/** welcome — same card as `welcard`, but from the /api/canvas/welcome design. */

const fs = require("fs");
const { make } = require("../src/welcomeCard");
const { targetOf } = require("../src/cardUtil");

module.exports = {
	config: {
		name: "welcome",
		aliases: ["wc"],
		version: "1.0",
		author: "Shihab",
		countDown: 8,
		role: 0,
		category: "image",
		shortDescription: { en: "Welcome card (welcome design) for you or a tagged person" },
		guide: { en: "{pn} → card for you\nReply to a message with {pn} or {pn} @user → card for that person\n(change the welcome TEXT with setwelcome)" }
	},

	onStart: async function ({ api, event, args, message }) {
		const uid = (await targetOf(event, args, api)) || String(event.senderID);
		const card = await make({ api, threadID: event.threadID, uid, kind: "welcome", timeout: 45000 });
		if (!card) return message.reply("❌ welcome card toiri hoy nai, pore abar try koro.");
		return message.reply({ body: `👋 Welcome ${card.name}!`, attachment: fs.createReadStream(card.file) });
	}
};
