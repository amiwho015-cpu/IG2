/**
 * File Name: live-send.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

/**
 * InstaBOT live module test — sends real DMs through igbot-api.
 *
 *   node test/live-send.js <threadID>
 *
 * Requires a working account.txt. Sends: a text effect, an avatar effect,
 * a music search + sticker, then prints a JSON summary.
 *
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const path = require("path");
const root = path.resolve(__dirname, "..");
const log = require(path.join(root, "src/logger"));
log.setQuiet(true);

const { loadConfig, loadAccount } = require(path.join(root, "src/config"));
const { createMessageContext } = require(path.join(root, "src/message"));

const threadID = process.argv[2];
if (!threadID) {
	console.error("Usage: node test/live-send.js <threadID>");
	process.exit(1);
}

/**
 * Log in through the same central adapter as the bot.
 */
function connect(config) {
	const ica = require(path.join(root, "Tanvir143/ica"));
	const appState = loadAccount();
	return new Promise((resolve, reject) =>
		ica.login({ appState }, { listenEvents: true, selfListen: config.selfListen === true, logLevel: "silent" },
			(error, client) => error ? reject(error) : resolve(client))
	);
}

function call(fn, ...args) {
	return new Promise((resolve, reject) => fn(...args, (error, result) => error ? reject(error) : resolve(result)));
}

(async () => {
	const config = loadConfig();
	const api = await connect(config);

	const me = api.getCurrentUserID();
	const message = createMessageContext({ api, event: { threadID: String(threadID), messageID: null }, log });
	const results = {};

	async function step(name, fn) {
		const started = Date.now();
		try {
			const result = await fn();
			results[name] = { ok: true, ms: Date.now() - started, result };
			console.log(`  ok  - ${name}`);
		}
		catch (error) {
			results[name] = { ok: false, ms: Date.now() - started, error: String(error.message || error) };
			console.log(`FAIL  - ${name}: ${error.message || error}`);
		}
	}

	console.log(`Live test as ${me} in thread ${threadID}`);

	await step("text effect (fire)", () => message.effect("InstaBOT effect test 🔥", "fire"));
	await step("avatar effect (laugh)", () => message.avatarEffect("InstaBOT avatar effect 😂", "laugh"));

	let track = null;
	await step("music search", async () => {
		const found = await message.musicSearch("shape of you");
		track = (found.tracks || [])[0] || null;
		if (!track) throw new Error("no tracks returned");
		return track;
	});
	if (track) await step("music sticker", () => message.music(track));

	const out = path.join(root, "..", "outputs", "instabot-live-send.json");
	require("fs").writeFileSync(out, JSON.stringify({ threadID, me, at: new Date().toISOString(), results }, null, 2));
	console.log(`\nWrote ${out}`);
	process.exit(0);
})().catch(error => { console.error("FATAL", error); process.exit(1); });
