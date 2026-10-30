"use strict";

const { run } = require("../src/helpMenu");

module.exports = {
	config: {
		name: "help",
		aliases: ["h", "menu", "commands"],
		author: "Neoaz 🐊",
		category: "info",
		cooldown: 3,
		role: 0,
		description: { en: "Show anime / image / media commands (help2 shows the rest)" },
		usage: { en: "{p}help [command]" }
	},

	onStart: function (ctx) { return run(ctx, "main"); }
};
