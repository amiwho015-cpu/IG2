"use strict";

const { createCanvas } = require("canvas");
const { resolveGender } = require("../src/gender");
const { MAX_MEMBERS, roundRect, fetchImage, loadAvatars, drawFallback, getGroup, shortName, drawMemberGrid, exportJpeg } = require("../src/gcCard");

const GIRL_COLOR = "#ff4d94";
const BOY_COLOR = "#4da6ff";
const MAX_COUPLES = 45;   // keeps the HD picture a sensible size
const MAX_SINGLES = 120;

const shuffle = list => list.slice().sort(() => Math.random() - 0.5);

/** Gender of every id, as saved by the `gender` command (or guessed from the name): 1 boy, 2 girl, 0 unknown. */
async function genderMap(usersData, ids) {
	const map = {};
	for (let i = 0; i < ids.length; i += 25) {
		await Promise.all(ids.slice(i, i + 25).map(async id => {
			try { map[id] = await resolveGender(usersData, id); }
			catch (_) { map[id] = { gender: 0, manual: false }; }
		}));
	}
	return map;
}

function heart(ctx, cx, cy, s, fill) {
	ctx.save();
	ctx.fillStyle = fill;
	ctx.shadowColor = fill; ctx.shadowBlur = 25;
	ctx.beginPath();
	ctx.moveTo(cx, cy + s * 0.9);
	ctx.bezierCurveTo(cx - s * 1.6, cy - s * 0.2, cx - s * 0.7, cy - s * 1.3, cx, cy - s * 0.4);
	ctx.bezierCurveTo(cx + s * 0.7, cy - s * 1.3, cx + s * 1.6, cy - s * 0.2, cx, cy + s * 0.9);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}

function person(ctx, cx, cy, r, id, avatars, color) {
	ctx.save();
	ctx.shadowColor = color; ctx.shadowBlur = 30;
	ctx.fillStyle = color;
	ctx.beginPath(); ctx.arc(cx, cy, r + 9, 0, Math.PI * 2); ctx.fill();
	ctx.restore();
	ctx.save();
	ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
	const img = avatars.images[id];
	if (img) ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2); else drawFallback(ctx, cx - r, cy - r, r * 2);
	ctx.restore();
}

function drawCard(ctx, x, y, w, h, n, girl, boy, avatars, textColor) {
	ctx.fillStyle = "rgba(255,255,255,0.10)";
	roundRect(ctx, x, y, w, h, 40); ctx.fill();
	ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 3;
	roundRect(ctx, x, y, w, h, 40); ctx.stroke();

	const r = 115, cy = y + 205, lx = x + 250, rx = x + w - 250, cx = x + w / 2;
	person(ctx, lx, cy, r, girl, avatars, GIRL_COLOR);
	person(ctx, rx, cy, r, boy, avatars, BOY_COLOR);

	ctx.save();
	ctx.strokeStyle = "rgba(255,77,148,0.55)"; ctx.lineWidth = 5; ctx.setLineDash([14, 12]);
	ctx.beginPath(); ctx.moveTo(lx + r + 25, cy); ctx.lineTo(cx - 70, cy); ctx.moveTo(cx + 70, cy); ctx.lineTo(rx - r - 25, cy); ctx.stroke();
	ctx.restore();
	heart(ctx, cx, cy, 46, "#ff2e63");

	ctx.save();
	ctx.textAlign = "center"; ctx.font = "bold 38px Arial";
	ctx.fillStyle = GIRL_COLOR; ctx.fillText(shortName(avatars.names[girl], 14) || "?", lx, cy + r + 62);
	ctx.fillStyle = BOY_COLOR; ctx.fillText(shortName(avatars.names[boy], 14) || "?", rx, cy + r + 62);
	ctx.fillStyle = "rgba(0,0,0,0.6)";
	ctx.beginPath(); ctx.arc(x + 52, y + 52, 30, 0, Math.PI * 2); ctx.fill();
	ctx.fillStyle = textColor; ctx.font = "bold 26px Arial";
	ctx.fillText(`#${n}`, x + 52, y + 61);
	ctx.restore();
}

module.exports = {
	config: {
		name: "couplegc2",
		aliases: ["cgc2", "coupleg2"],
		version: "1.0",
		author: "CRX Shihab",
		countDown: 10,
		role: 0,
		description: { en: "HD group card with every boy-girl couple of the group" },
		category: "image",
		guide: {
			en: "{pn}   → pairs every girl with a boy (saved genders) and shows all the couples in one HD picture\n" +
				"Set genders first with: gender girl / gender boy\n" +
				"--color <color>  text color (default white)"
		}
	},

	onStart: async function ({ api, args, event, message, usersData }) {
		try {
			let textColor = "white";
			for (let i = 0; i < args.length; i++) if (args[i] === "--color") textColor = args[++i] || textColor;

			const group = await getGroup(api, event.threadID);
			const botID = String(api.getCurrentUserID());
			const people = group.everyone.filter(id => id !== botID).slice(0, MAX_MEMBERS);
			if (!people.length) return message.reply("❌ Could not read this group's members.");

			const genders = await genderMap(usersData, people);
			const g = id => (genders[id] && genders[id].gender) || 0;
			// people whose gender was set by hand are paired first; the rest are random
			const order = list => { const mixed = shuffle(list); return [...mixed.filter(id => genders[id] && genders[id].manual), ...mixed.filter(id => !(genders[id] && genders[id].manual))]; };
			const girls = order(people.filter(id => g(id) === 2));
			const boys = order(people.filter(id => g(id) === 1));
			const others = people.filter(id => g(id) !== 1 && g(id) !== 2);

			const total = Math.min(girls.length, boys.length);
			if (!total) {
				const missing = !girls.length && !boys.length ? "a girl or a boy" : !girls.length ? "a girl" : "a boy";
				return message.reply(
					`❌ I couldn't find ${missing} in this group.\n` +
					"Members set their gender with: gender girl / gender boy\n" +
					"(admins can run: gender scan, to see who is still unknown)"
				);
			}
			const used = Math.min(total, MAX_COUPLES);
			const couples = Array.from({ length: used }, (_, i) => [girls[i], boys[i]]);
			const singles = [...girls.slice(used), ...boys.slice(used), ...others].slice(0, MAX_SINGLES);

			const avatars = await loadAvatars(api, [...couples.flat(), ...singles]);

			// layout: couple cards (3 per row), then the singles
			const width = 3200, perRow = 3, cardW = 960, cardH = 470, gapX = 40, rowStep = 510;
			const x0 = Math.round((width - (perRow * cardW + (perRow - 1) * gapX)) / 2);
			const coupleTop = 650;
			const rows = Math.ceil(couples.length / perRow);
			const coupleBottom = coupleTop + rows * rowStep;
			const sSize = 150, sSpacing = 30, sPerRow = 14, sRowStep = sSize + sSpacing + 30;
			const singlesTop = coupleBottom + 150;
			const singleRows = Math.ceil(singles.length / sPerRow);
			const height = Math.max(1500, (singles.length ? singlesTop + singleRows * sRowStep : coupleBottom) + 200);
			const canvas = createCanvas(width, height);
			const ctx = canvas.getContext("2d");

			const bg = ctx.createLinearGradient(0, 0, width, height);
			bg.addColorStop(0, "#1b0a2a"); bg.addColorStop(0.5, "#2a0f3a"); bg.addColorStop(1, "#0d1b3a");
			ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
			const glowBg = ctx.createRadialGradient(width / 2, 300, 0, width / 2, 300, 1200);
			glowBg.addColorStop(0, "rgba(255,77,148,0.25)"); glowBg.addColorStop(1, "rgba(255,77,148,0)");
			ctx.fillStyle = glowBg; ctx.fillRect(0, 0, width, 1500);

			// group picture, name, stats
			const groupImg = await fetchImage(group.info.imageSrc || group.info.thumbSrc);
			if (groupImg) {
				ctx.save();
				ctx.beginPath(); ctx.arc(width / 2, 170, 110, 0, Math.PI * 2); ctx.clip();
				ctx.drawImage(groupImg, width / 2 - 110, 60, 220, 220);
				ctx.restore();
				ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 4;
				ctx.beginPath(); ctx.arc(width / 2, 170, 110, 0, Math.PI * 2); ctx.stroke();
			}
			ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 15;
			ctx.font = "bold 80px Arial"; ctx.fillStyle = textColor; ctx.textAlign = "center";
			let groupName = group.name;
			if (groupName.length > 30) groupName = groupName.substring(0, 27) + "...";
			ctx.fillText(groupName, width / 2, 380);
			ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
			ctx.font = "44px Arial"; ctx.fillStyle = "rgba(255,255,255,0.8)";
			ctx.fillText(`${group.everyone.length} Members  |  ${couples.length} Couples`, width / 2, 450);

			ctx.font = "bold 60px Arial"; ctx.fillStyle = textColor;
			ctx.fillText("COUPLES", width / 2, coupleTop - 60);

			couples.forEach(([girl, boy], i) => {
				const x = x0 + (i % perRow) * (cardW + gapX);
				const y = coupleTop + Math.floor(i / perRow) * rowStep;
				drawCard(ctx, x, y, cardW, cardH, i + 1, girl, boy, avatars, textColor);
			});

			if (singles.length) {
				ctx.font = "bold 56px Arial"; ctx.fillStyle = textColor; ctx.textAlign = "center";
				ctx.fillText("SINGLES", width / 2, singlesTop - 60);
				const sx0 = Math.round((width - (sPerRow * (sSize + sSpacing) - sSpacing)) / 2);
				drawMemberGrid(ctx, singles, avatars, {
					x0: sx0, y0: singlesTop, perRow: sPerRow, size: sSize, spacing: sSpacing, rowStep: sRowStep,
					textColor, memberColor: "cyan", adminColor: "yellow", adminSet: new Set(group.adminIDs), glow: false
				});
			}

			ctx.font = "30px Arial"; ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.textAlign = "center";
			ctx.fillText("couplegc2 HD", width / 2, height - 50);

			// HD: full size, high quality (no shrinking like the other cards)
			const buffer = exportJpeg(canvas, createCanvas);
			const body = `💞 Couple GC 2 (HD)\n\n📌 Group: ${group.name}\n👫 Couples: ${couples.length}` +
				(singles.length ? `\n🙋 Singles: ${singles.length}` : "") +
				(total > MAX_COUPLES ? `\n(showing first ${MAX_COUPLES} couples)` : "");
			return message.reply({ body, attachment: { buffer, fileName: "couplegc2.jpg" } });
		}
		catch (err) {
			return message.reply(`❌ Error: ${err.message || err}`);
		}
	}
};
