"use strict";

// -kill @user | reply | numeric id | @username
// Rewritten for Instagram: avatars come from the Instagram profile (not graph.facebook.com),
// the target can be a reply / @tag / @username / id, and the picture is sent as JPEG.

const fs = require("fs");
const axios = require("axios");
const Canvas = require("canvas");
const { profileOf, avatarUrl, drawableName, writeTemp, targetOf } = require("../src/cardUtil");
const { safeLoadImage } = require("../src/pairUtil");

const BG_URL = "https://i.imgur.com/B318OFJ.jpeg";

async function loadBackground() {
	try {
		const res = await axios.get(BG_URL, { responseType: "arraybuffer", timeout: 15000, headers: { "User-Agent": "Mozilla/5.0" } });
		return await Canvas.loadImage(Buffer.from(res.data));
	}
	catch (_) { return null; }
}

function circle(ctx, img, cx, cy, r, ring) {
	ctx.save();
	ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
	ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
	ctx.restore();
	if (ring) {
		ctx.lineWidth = Math.max(3, r / 14);
		ctx.strokeStyle = ring;
		ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
	}
}

function drawScene(bg, killerImg, victimImg, killerName, victimName) {
	if (bg) {
		// original artwork: avatars go on the two heads
		const canvas = Canvas.createCanvas(bg.width, bg.height);
		const ctx = canvas.getContext("2d");
		ctx.drawImage(bg, 0, 0);
		circle(ctx, killerImg, 150, 130, 30);
		circle(ctx, victimImg, 360, 290, 30);
		return canvas;
	}
	// fallback card when the artwork cannot be downloaded
	const W = 1100, H = 620;
	const canvas = Canvas.createCanvas(W, H);
	const ctx = canvas.getContext("2d");
	const g = ctx.createLinearGradient(0, 0, W, H);
	g.addColorStop(0, "#1a0000"); g.addColorStop(1, "#5a0a0a");
	ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
	const r = 190, cy = 300;
	circle(ctx, killerImg, 270, cy, r, "#ffffff");
	circle(ctx, victimImg, W - 270, cy, r, "#ff2a2a");
	ctx.strokeStyle = "#ff2a2a"; ctx.lineWidth = 26; ctx.lineCap = "round";
	const x = W - 270;
	ctx.beginPath(); ctx.moveTo(x - r * 0.7, cy - r * 0.7); ctx.lineTo(x + r * 0.7, cy + r * 0.7); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(x + r * 0.7, cy - r * 0.7); ctx.lineTo(x - r * 0.7, cy + r * 0.7); ctx.stroke();
	ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
	ctx.font = "bold 84px sans-serif"; ctx.fillText("KILLED", W / 2, 120);
	ctx.font = "bold 40px sans-serif";
	ctx.fillText(killerName, 270, 560);
	ctx.fillText(victimName, W - 270, 560);
	return canvas;
}

module.exports = {
	config: {
		name: "kill",
		aliases: ["killed"],
		version: "3.0",
		author: "CRX Shihab",
		role: 0,
		countDown: 5,
		shortDescription: "Make a kill-style image",
		longDescription: "Generate a kill-themed image with the two profile pictures.",
		category: "FUN & SOCIAL",
		guide: { en: "{pn} @mention | @username | reply | uid" }
	},

	onStart: async function ({ api, event, message, args }) {
		try {
			const senderID = String(event.senderID);
			const targetID = await targetOf(event, args, api);
			if (!targetID) return message.reply("❌ Kake kill korbo? Reply koro, @username ba id dao.");

			const [pA, pB] = await Promise.all([profileOf(api, senderID), profileOf(api, targetID)]);
			const [urlA, urlB] = await Promise.all([avatarUrl(api, senderID, pA), avatarUrl(api, targetID, pB)]);
			const [imgA, imgB, bg] = await Promise.all([
				safeLoadImage(Canvas, axios, urlA),
				safeLoadImage(Canvas, axios, urlB),
				loadBackground()
			]);

			const nameA = drawableName(pA, senderID);
			const nameB = drawableName(pB, targetID);
			const canvas = drawScene(bg, imgA, imgB, nameA, nameB);

			const file = writeTemp(canvas.toBuffer("image/jpeg", { quality: 0.92 }), "jpg", "kill");
			const realA = (pA && (pA.name || pA.username)) || nameA;
			const realB = (pB && (pB.name || pB.username)) || nameB;
			await message.reply({ body: `${realA} is killing ${realB} 💀`, attachment: fs.createReadStream(file) });
		}
		catch (err) {
			console.error("[kill] failed:", err && err.stack || err);
			return message.reply(`❌ kill failed: ${(err && err.message) || "unknown error"}`);
		}
	}
};
