"use strict";

module.exports = require("../src/canvasCommand").createCanvasCommand({
	name: "beautiful",
	aliases: ["beauty"],
	caption: "✨ So beautiful! 😍",
	guide: {
		short: "Beautiful meme picture",
		usage: "{pn} → your picture\nReply to a message with {pn} or {pn} @user → that person's picture"
	}
});
