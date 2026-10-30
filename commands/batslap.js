"use strict";

module.exports = require("../src/canvasCommand").createCanvasCommand({
	name: "batslap",
	aliases: ["bslap"],
	two: true,
	caption: "🦇 Batman slap! 👋",
	needText: "Kake slap korbo? Reply koro ba @tag koro 😏",
	guide: {
		short: "Batman slaps Robin picture",
		usage: "Reply to a message with {pn} or {pn} @user → you slap that person"
	}
});
