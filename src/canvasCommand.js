"use strict";

/**
 * Factory for the picture commands that call the toshiro canvas API.
 *
 *   one picture : beautiful, horny      (reply / @tag / id / yourself)
 *   two pictures: batslap               (you slap the replied / tagged person)
 *
 * Author: Shihab
 */

const fs = require("fs");
const { canvas } = require("./canvasApi");
const { avatarUrl, writeTemp, targetOf } = require("./cardUtil");

function createCanvasCommand({ name, aliases = [], endpoint = name, two = false, caption, needText, guide }) {
	return {
		config: {
			name,
			aliases,
			version: "1.0",
			author: "Shihab",
			countDown: 8,
			role: 0,
			category: "image",
			shortDescription: { en: guide.short },
			guide: { en: guide.usage }
		},

		onStart: async function ({ api, event, args, message }) {
			const me = String(event.senderID);
			const target = await targetOf(event, args, api);

			if (two && !target) return message.reply(needText || "Kake? Reply koro ba @tag koro 🙂");
			if (two && target === me) return message.reply("Nijeke nije? Onno kauke tag koro 😅");

			let fields;
			try {
				if (two) {
					const [a1, a2] = await Promise.all([avatarUrl(api, me), avatarUrl(api, target)]);
					if (!a1 || !a2) throw new Error("profile picture pawa jayni");
					fields = { avatar1: a1, avatar2: a2 };
				}
				else {
					const uid = target || me;
					const a = await avatarUrl(api, uid);
					if (!a) throw new Error("profile picture pawa jayni");
					fields = { avatar: a };
				}
				const img = await canvas(endpoint, fields);
				const file = writeTemp(img.buffer, img.ext, name);
				return message.reply({ body: caption, attachment: fs.createReadStream(file) });
			}
			catch (error) {
				return message.reply(`❌ ${name} card toiri hoy nai: ${error.message}`);
			}
		}
	};
}

module.exports = { createCanvasCommand };
