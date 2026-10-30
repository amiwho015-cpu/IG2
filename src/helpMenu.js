"use strict";

/**
 * Shared menu builder for `help` (anime / image / media) and `help2` (every
 * other category). Long menus are split so no single message gets too big.
 */

const MAIN_CATEGORIES = new Set(["anime", "image", "media"]);
const CHUNK = 1500;
const TEXT_EFFECTS = ["love", "gift", "celebration", "fire"];

function cleanCategoryName(text) {
	if (!text) return "others";
	return String(text).normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim().toLowerCase() || "others";
}

function randomTextEffect() {
	return TEXT_EFFECTS[Math.floor(Math.random() * TEXT_EFFECTS.length)];
}

function detailText(command, config) {
	const prefix = config.prefix;
	const c = command.config;
	const description = (c.description && (c.description[config.language] || c.description.en)) ||
		(c.shortDescription && (c.shortDescription[config.language] || c.shortDescription.en)) || "—";
	const usage = ((c.usage && (c.usage[config.language] || c.usage.en)) || `${prefix}${c.name}`).replace(/\{p\}/g, prefix);
	let version = "1.0.0";
	try { version = require("../package.json").version; } catch (_) { }
	return [
		"☠️ 𝗖𝗢𝗠𝗠𝗔𝗡𝗗 𝗜𝗡𝗙𝗢 ☠️", "",
		`➥ Name: ${c.name}`,
		`➥ Category: ${c.category || "Uncategorized"}`,
		`➥ Description: ${typeof description === "string" ? description : "—"}`,
		`➥ Aliases: ${c.aliases && c.aliases.length ? c.aliases.join(", ") : "None"}`,
		`➥ Usage: ${usage}`,
		`➥ Permission: ${c.role || 0}`,
		`➥ Author: ${c.author || "—"}`,
		`➥ Version: ${version}`
	].join("\n");
}

function menuChunks(registry, config, which) {
	const prefix = config.prefix;
	const byCategory = {};
	for (const command of registry.commands.values()) {
		if (command.config.hidden) continue;
		const category = cleanCategoryName(command.config.category);
		if (MAIN_CATEGORIES.has(category) !== (which === "main")) continue;
		(byCategory[category] = byCategory[category] || []).push(command.config.name);
	}

	const title = `━━━☠️ ${String(config.botName || "InstaBOT").toUpperCase()}${which === "main" ? "" : " • MORE"} ☠️━━━`;
	const footer = which === "main"
		? `\n➥×${prefix}help2 → all other commands\n➥×${prefix}help [command] → details`
		: `\n➥×${prefix}help → anime / image / media\n➥×${prefix}help [command] → details`;

	const blocks = Object.keys(byCategory).sort().map(category => {
		const names = byCategory[category].sort();
		return `\n╭──『 ${category.toUpperCase()} 』\n` +
			names.map((n, i) => `${i === 0 ? "➥" : ""}×${prefix}${n}`).join("  ") + "\n╰────────────◊";
	});

	const chunks = [];
	let current = title;
	for (const block of blocks) {
		if (current.length + block.length > CHUNK && current !== title) { chunks.push(current); current = ""; }
		current += block;
	}
	current += footer;
	chunks.push(current);
	// number the parts and start every part with a header, so no part can begin with "-command"
	if (chunks.length > 1) {
		for (let i = 1; i < chunks.length; i++) chunks[i] = `━━━☠️ ${i + 1}/${chunks.length} ☠️━━━\n${chunks[i].replace(/^\n/, "")}`;
	}
	return chunks;
}

async function run({ message, args, config, registry }, which) {
	const query = (args[0] || "").toLowerCase();
	if (query) {
		const command = registry.resolve(query);
		if (!command) return message.send(`❌ Command "${query}" not found.`);
		const body = detailText(command, config);
		try { return await message.send({ body, effect: randomTextEffect() }); }
		catch (_) { return message.send(body); }
	}
	const chunks = menuChunks(registry, config, which);
	const effect = randomTextEffect();
	for (let i = 0; i < chunks.length; i++) {
		try { await message.send({ body: chunks[i], effect }); }
		catch (_) { await message.send(chunks[i]); }
	}
}

module.exports = { run, menuChunks, MAIN_CATEGORIES, cleanCategoryName };
