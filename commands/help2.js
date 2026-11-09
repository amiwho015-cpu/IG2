"use strict";

const { run } = require("../src/helpMenu");

module.exports = {
	config: {
		name: "help2",
		aliases: ["h2", "menu2"],
		author: "Neoaz 🐊",
		category: "info",
		cooldown: 3,
		role: 2,
		description: { en: "Show every command except anime / image / media (bot admin only)" },
		usage: { en: "{p}help2 [command]" }
	},

	onStart: function (ctx) { return run(ctx, "more"); }
};
