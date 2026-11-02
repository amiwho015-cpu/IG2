/**
 * File Name: help.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

const TEXT_EFFECTS = ["love", "love", "celebration", "love"];

function cleanCategoryName(text) {
	if (!text) return "others";
	return String(text)
		.normalize("NFKD")
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase() || "others";
}

function randomTextEffect() {
	return TEXT_EFFECTS[Math.floor(Math.random() * TEXT_EFFECTS.length)];
}

module.exports = {
	config: {
		name: "help",
		aliases: ["h", "menu", "commands"],
		author: "Tanvir143",
		category: "Users Cmd",
		cooldown: 3,
		role: 0,
		description: {
			en: "Show all available commands or details for one"
		},
		usage: {
			en: ".help [command]"
		}
	},

	onStart: async function ({ message, args, config, registry }) {
		const prefix = config.prefix;
		const query = (args[0] || "").toLowerCase().trim();

		if (query) {
			const command = registry.resolve(query);

			if (!command)
				return message.send(`Command "${query}" not found.`);

			const c = command.config;

			const description =
				(c.description &&
					(c.description[config.language] || c.description.en)) ||
				"—";

			const usage =
				((c.usage &&
					(c.usage[config.language] || c.usage.en)) ||
					`${prefix}${c.name}`)
					.replace(/\{p\}/g, prefix);

			let version = "1.0.0";

			try {
				version = require("../package.json").version;
			} catch (_) {}

			const aliases =
				c.aliases && c.aliases.length
					? c.aliases.join(", ")
					: "None";

			const body = [
				"📦 𝗖𝗢𝗠𝗠𝗔𝗡𝗗 𝗗𝗘𝗧𝗔𝗜𝗟𝗦",
				"",
				`╴ 𝗡𝗮𝗺𝗲       ${c.name}`,
				`╴ 𝗖𝗮𝘁𝗲𝗴𝗼𝗿𝘆  ${c.category || "Uncategorized"}`,
				`╴ 𝗗𝗲𝘀𝗰       ${description}`,
				`╴ 𝗔𝗹𝗶𝗮𝘀𝗲𝘀   ${aliases}`,
				`╴ 𝗨𝘀𝗮𝗴𝗲     ${usage}`,
				`╴ 𝗣𝗲𝗿𝗺𝗶𝘀𝘀𝗶𝗼𝗻  ${c.role || 0}`,
				`╴ 𝗔𝘂𝘁𝗵𝗼𝗿     ${c.author || "—"}`,
				`╴ 𝗩𝗲𝗿𝘀𝗶𝗼𝗻    ${version}`,
				"",
				"────────────────────",
				`  ${prefix}help  •  command menu`
			].join("\n");

			try {
				return await message.send({
					body,
					effect: randomTextEffect()
				});
			} catch (_) {
				return message.send(body);
			}
		}

		const byCategory = {};

		for (const command of registry.commands.values()) {
			const c = command.config;

			if (!c || c.hidden) continue;

			const category = cleanCategoryName(c.category);

			if (!byCategory[category])
				byCategory[category] = [];

			byCategory[category].push(c.name);
		}

		for (const category of Object.keys(byCategory)) {
			byCategory[category] = [
				...new Set(byCategory[category])
			].sort((a, b) =>
				String(a).localeCompare(String(b))
			);
		}

		const categories = Object.keys(byCategory).sort();

		const totalCommands = categories.reduce(
			(total, category) =>
				total + byCategory[category].length,
			0
		);

		const lines = [
			"•        𝗧𝗮𝗻𝘃𝗶𝗿𝟭𝟰𝟯_𝗶𝗴𝗕𝗼𝘁",
			"          ᴄᴏᴍᴍᴀɴᴅ ᴄᴇɴᴛᴇʀ",
			""
		];

		for (const category of categories) {
			const names = byCategory[category];

			lines.push("");
			lines.push(
				`             𝗔𝗗𝗠𝗜𝗡`
					.replace("𝗔𝗗𝗠𝗜𝗡", category.toUpperCase())
			);

			for (const name of names) {
				lines.push(`│ .${name}`.replace("│ .", `│ ${prefix}`));
			}

			lines.push("────────────────────");
		}

		lines.push("");
		lines.push(
			`        𝗧𝗼𝘁𝗮𝗹 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀: 𝟯𝟮`
				.replace("𝟯𝟮", String(totalCommands))
		);
		lines.push("");
		lines.push(`        ᴜsᴇ ${prefix}help (cmdName)`);
		lines.push(`           ғᴏʀ ᴅᴇᴛᴀɪʟs`);

		const body = lines.join("\n");

		try {
			return await message.send({
				body,
				effect: randomTextEffect()
			});
		} catch (_) {
			return message.send(body);
		}
	}
};
