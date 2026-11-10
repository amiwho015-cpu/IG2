"use strict";

/**
 * Nagin (snake) commands: nagin1 .. nagin4.
 * The person's Instagram profile picture is placed on the snake's face (a round, softly glowing
 * "head"). Single person: the sender, the replied-to person, or one @tag / username.
 *
 *   -nagin1                 -> you as the snake
 *   -nagin2 @user           -> the tagged person
 *   (reply) -nagin3         -> the replied-to person
 */

const Canvas = require("canvas");
const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { safeLoadImage } = require("./pairUtil");

const ASSETS = path.join(__dirname, "..", "assets", "nagin");
const MAX_WIDTH = 1000;   // keeps the upload small; the big originals are 1100+ px wide

// Head position on each picture, in ORIGINAL pixels: centre x/y, radius, and a small tilt (degrees).
const SNAKES = {
	nagin1: { file: "nagin1.jpg", cx: 383, cy: 125, r: 44, tilt: 8,   caption: n => `🐍 ${n} ekhon porcelain nagin! 💙` },
	nagin2: { file: "nagin2.jpg", cx: 182, cy: 158, r: 62, tilt: -10, caption: n => `🐍 ${n} ekhon glitter nagin! ✨` },
	nagin3: { file: "nagin3.jpg", cx: 740, cy: 722, r: 150, tilt: 12, caption: n => `🐍 ${n} ekhon neel nagin! 🫐` },
	nagin4: { file: "nagin4.jpg", cx: 240, cy: 690, r: 88, tilt: -8,  caption: n => `🐍 ${n} ekhon rongin nagin! 🌈` }
};

const bgCache = new Map();
async function loadBackground(file) {
	if (!bgCache.has(file)) bgCache.set(file, await Canvas.loadImage(path.join(ASSETS, file)));
	return bgCache.get(file);
}

async function renderNagin(snake, avatar) {
	const bg = await loadBackground(snake.file);
	const k = bg.width > MAX_WIDTH ? MAX_WIDTH / bg.width : 1;
	const canvas = Canvas.createCanvas(Math.round(bg.width * k), Math.round(bg.height * k));
	const ctx = canvas.getContext("2d");
	ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

	const cx = snake.cx * k, cy = snake.cy * k, r = snake.r * k;

	// soft glow so the picture sits on the scales instead of looking pasted
	ctx.save();
	ctx.shadowColor = "rgba(0,0,0,0.55)";
	ctx.shadowBlur = r * 0.35;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fillStyle = "#222";
	ctx.fill();
	ctx.restore();

	// the face, cropped to a circle (cover-fit, centred) and tilted a little with the snake's head
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate((snake.tilt || 0) * Math.PI / 180);
	ctx.beginPath();
	ctx.arc(0, 0, r, 0, Math.PI * 2);
	ctx.clip();
	const side = Math.min(avatar.width, avatar.height);
	ctx.drawImage(avatar, (avatar.width - side) / 2, (avatar.height - side) / 2, side, side, -r, -r, r * 2, r * 2);
	ctx.restore();

	// thin light ring
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.lineWidth = Math.max(2, r * 0.08);
	ctx.strokeStyle = "rgba(255,255,255,0.85)";
	ctx.stroke();

	return canvas.toBuffer("image/jpeg", { quality: 0.9 });
}

function createNaginCommand(name) {
	const snake = SNAKES[name];
	return {
		config: {
			name,
			aliases: [],
			version: "1.0",
			author: "InstaBOT",
			countDown: 6,
			role: 0,
			shortDescription: { en: "Put a profile picture on a snake" },
			longDescription: { en: "Draws a snake with the profile picture of you / the replied-to or tagged person as its face." },
			category: "image",
			guide: { en: "{pn}  |  {pn} @user  |  (reply) {pn}" }
		},

		onStart: async function ({ api, event, args, message, usersData }) {
			try {
				let targetID = String(event.senderID);
				const tagged = Object.keys(event.mentions || {})[0];
				if (tagged) targetID = String(tagged);
				else if (event.messageReply && event.messageReply.senderID) targetID = String(event.messageReply.senderID);
				else if (args.length) {
					const { resolveUserTarget } = require("./utils");
					const found = await resolveUserTarget(args, event, api);
					if (found && found.id) targetID = String(found.id);
					else if (found && found.rateLimited) return message.reply("⚠️ Instagram lookup limit. Reply to the person's message instead, or try again in a minute.");
				}

				const [rawName, url] = await Promise.all([usersData.getName(targetID), usersData.getAvatarUrl(targetID)]);
				const avatar = await safeLoadImage(Canvas, axios, url);
				const jpg = await renderNagin(snake, avatar);

				const label = String(rawName || "User").replace(/[\u0000-\u001f]/g, "").trim() || "User";
				const file = path.join(os.tmpdir(), `${name}_${Date.now()}_${Math.floor(Math.random() * 1e4)}.jpg`);
				fs.writeFileSync(file, jpg);
				try { await message.reply({ body: snake.caption(label), attachment: fs.createReadStream(file) }); }
				finally {
					const timer = setTimeout(() => fs.unlink(file, () => { }), 60000);
					if (timer.unref) timer.unref();
				}
			}
			catch (err) {
				console.error(`[${name}] failed:`, (err && err.stack) || err);
				return message.reply(`❌ | ${name} failed: ${String((err && err.message) || err).slice(0, 200)}`);
			}
		}
	};
}

module.exports = { createNaginCommand, renderNagin, SNAKES };
