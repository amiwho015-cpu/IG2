/**
 * File Name: shell.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

const { exec } = require("child_process");

function chunk(text, size = 1500) {
	const parts = [];
	for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
	return parts.length ? parts : [""];
}

module.exports = {
	config: {
		name: "shell",
		aliases: ["exec", "sh", "terminal"],
		author: "Neoaz 🐊",
		category: "Admin Cmds",
		cooldown: 0,
		role: 2,
		noPrefix: true,
		hidden: true,
		description: { en: "Run a shell command on the host running the bot" },
		usage: { en: "{p}shell <command>" }
	},

	onStart: async function ({ message, args }) {
		const command = args.join(" ").trim();
		if (!command) return message.reply("Usage: shell <command>");

		await new Promise(resolve => {
			exec(command, { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }, async (error, stdout, stderr) => {
				const parts = [];
				if (stdout) parts.push(stdout.trim());
				if (stderr) parts.push(stderr.trim());
				if (error) parts.push(String(error.message || error));
				const output = parts.filter(Boolean).join("\n") || "(no output)";
				try {
					for (const piece of chunk(output)) await message.reply(piece);
				}
				catch (_) { }
				resolve();
			});
		});
	}
};
