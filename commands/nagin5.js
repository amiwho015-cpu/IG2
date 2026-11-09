"use strict";

/**
 * nagin5 — makes a snake picture with the profile picture of the person you tag.
 *   -nagin5 @name            -> one snake with their pp (single)
 *   -nagin5 @name1 @name2    -> two snakes, one pp each (double)
 *   -nagin5                  -> uses the person you replied to, or yourself
 */

const axios = require("axios");
const Canvas = require("canvas");
const { safeLoadImage } = require("../src/pairUtil");

const W = 1000, H = 600;

function targetIDs(event) {
	const mentions = event.mentions && typeof event.mentions === "object" ? Object.keys(event.mentions) : [];
	if (mentions.length) return mentions.slice(0, 2).map(String);
	if (event.messageReply && event.messageReply.senderID) return [String(event.messageReply.senderID)];
	return [String(event.senderID)];
}

// A wavy snake body from left to right, drawn as a thick green stroke with stripes.
function drawSnake(ctx, yBase, phase) {
	const pts = [];
	for (let x = 0; x <= 700; x += 10) {
		pts.push({ x: 150 + x, y: yBase + Math.sin(x / 90 + phase) * 45 });
	}
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.strokeStyle = "#1f7a3a";
	ctx.lineWidth = 46;
	ctx.beginPath();
	pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
	ctx.stroke();

	ctx.strokeStyle = "#7fd66a";
	ctx.lineWidth = 8;
	ctx.setLineDash([18, 22]);
	ctx.beginPath();
	pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y - 8) : ctx.moveTo(p.x, p.y - 8)));
	ctx.stroke();
	ctx.setLineDash([]);

	// head at the left end
	const head = pts[0];
	ctx.fillStyle = "#1f7a3a";
	ctx.beginPath();
	ctx.arc(head.x - 10, head.y, 34, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = "#ffd700";
	ctx.beginPath(); ctx.arc(head.x - 22, head.y - 12, 8, 0, Math.PI * 2); ctx.fill();
	ctx.beginPath(); ctx.arc(head.x - 22, head.y + 12, 8, 0, Math.PI * 2); ctx.fill();
	ctx.fillStyle = "#000";
	ctx.beginPath(); ctx.arc(head.x - 24, head.y - 12, 3, 0, Math.PI * 2); ctx.fill();
	ctx.beginPath(); ctx.arc(head.x - 24, head.y + 12, 3, 0, Math.PI * 2); ctx.fill();
	ctx.strokeStyle = "#e0245e";
	ctx.lineWidth = 4;
	ctx.beginPath(); ctx.moveTo(head.x - 40, head.y); ctx.lineTo(head.x - 62, head.y - 8); ctx.moveTo(head.x - 40, head.y); ctx.lineTo(head.x - 62, head.y + 8); ctx.stroke();

	// the profile picture sits on the body, in the middle
	return pts[Math.floor(pts.length / 2)];
}

function drawPp(ctx, img, cx, cy, r) {
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.closePath();
	ctx.clip();
	ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
	ctx.restore();
	ctx.lineWidth = 8;
	ctx.strokeStyle = "#ffd700";
	ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
}

module.exports = {
	config: {
		name: "nagin5",
		version: "1.0",
		author: "InstaBOT",
		countDown: 5,
		role: 0,
		category: "fun",
		description: { en: "Snake picture with the tagged person's profile picture" },
		guide: { en: "{pn} @tag\n{pn} @tag1 @tag2 (double)\n{pn} (reply to someone)" }
	},

	onStart: async function ({ api, event, usersData, message }) {
		const react = emoji => Promise.resolve(api.setMessageReaction(emoji, event.messageID)).catch(() => { });
		await react("⏳");
		try {
			const ids = targetIDs(event);
			const pics = await Promise.all(ids.map(async id => {
				const url = await usersData.getAvatarUrl(id);
				return safeLoadImage(Canvas, axios, url);
			}));

			const canvas = Canvas.createCanvas(W, H);
			const ctx = canvas.getContext("2d");
			ctx.fillStyle = "#0b1d12";
			ctx.fillRect(0, 0, W, H);
			for (let i = 0; i < 60; i++) {
				ctx.fillStyle = `rgba(127,214,106,${(Math.random() * 0.2).toFixed(2)})`;
				ctx.beginPath();
				ctx.arc(Math.random() * W, Math.random() * H, 2 + Math.random() * 3, 0, Math.PI * 2);
				ctx.fill();
			}

			// single: one snake in the middle. double: two snakes, one above the other.
			const rows = pics.length === 2 ? [190, 430] : [315];
			pics.forEach((img, i) => {
				const mid = drawSnake(ctx, rows[i], i * 1.7);
				if (img) drawPp(ctx, img, mid.x, mid.y, 70);
			});

			await message.reply({ attachment: [{ buffer: canvas.toBuffer("image/png"), fileName: "nagin5.png" }] });
			await react("✅");
		}
		catch (e) {
			console.error("[nagin5] failed:", (e && e.message) || e);
			await react("❌");
			return message.reply(`❌ Nagin banate parlam na: ${((e && e.message) || "try again").toString().slice(0, 200)}`);
		}
	}
};
