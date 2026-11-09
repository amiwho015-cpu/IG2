"use strict";

const { createCanvas } = require("canvas");
const { resolveGender } = require("../src/gender");
const { MAX_MEMBERS, roundRect, fetchImage, loadAvatars, drawFallback, getGroup, shortName, drawMemberGrid, exportJpeg } = require("../src/gcCard");

const GIRL_COLOR = "#ff4d94";
const BOY_COLOR = "#4da6ff";

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
	ctx.shadowColor = fill; ctx.shadowBlur = 40;
	ctx.beginPath();
	ctx.moveTo(cx, cy + s * 0.9);
	ctx.bezierCurveTo(cx - s * 1.6, cy - s * 0.2, cx - s * 0.7, cy - s * 1.3, cx, cy - s * 0.4);
	ctx.bezierCurveTo(cx + s * 0.7, cy - s * 1.3, cx + s * 1.6, cy - s * 0.2, cx, cy + s * 0.9);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}

function drawCouplePerson(ctx, cx, cy, r, id, avatars, color, name) {
	ctx.save();
	ctx.shadowColor = color; ctx.shadowBlur = 50;
	ctx.fillStyle = color;
	ctx.beginPath(); ctx.arc(cx, cy, r + 14, 0, Math.PI * 2); ctx.fill();
	ctx.restore();

	ctx.save();
	ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
	const img = avatars.images[id];
	if (img) ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2); else drawFallback(ctx, cx - r, cy - r, r * 2);
	ctx.restore();

	ctx.save();
	ctx.font = "bold 60px Arial"; ctx.fillStyle = color; ctx.textAlign = "center";
	ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 10;
	ctx.fillText(shortName(name, 16) || "?", cx, cy + r + 90);
	ctx.restore();
}

module.exports = {
	config: {
		name: "couplegc",
		aliases: ["cgc", "coupleg"],
		version: "2.0",
		author: "CRX Shihab",
		countDown: 5,
		role: 0,
		description: { en: "Group card with a couple on top and every member below" },
		category: "image",
		guide: {
			en: "{pn}   → picks a girl (left) and a boy (right) from the group using the saved genders\n" +
				"{pn} @someone   → that person + a random partner of the other gender\n" +
				"{pn} @a @b   → exactly those two (girl goes left, boy goes right)\n" +
				"Set genders first with: gender girl / gender boy\n" +
				"--color <color>  text color (default white)\n" +
				"--glow <color>   glow on member pictures (default none)"
		}
	},

	onStart: async function ({ api, args, event, message, usersData }) {
		try {
			let textColor = "white", glow = false;
			for (let i = 0; i < args.length; i++) {
				if (args[i] === "--color") textColor = args[++i] || textColor;
				else if (args[i] === "--glow") glow = args[++i] || false;
			}

			const group = await getGroup(api, event.threadID);
			const { everyone, adminIDs } = group;
			if (!everyone.length) return message.reply("❌ Could not read this group's members.");

			// the couple: a girl on the left and a boy on the right, from the saved genders
			const botID = String(api.getCurrentUserID());
			const candidates = everyone.filter(id => id !== botID);
			const tagged = [];
			const addTagged = id => { id = id == null ? "" : String(id); if (id && !tagged.includes(id)) tagged.push(id); };
			Object.keys(event.mentions || {}).forEach(addTagged);
			if (event.messageReply && event.messageReply.senderID) addTagged(event.messageReply.senderID);

			const genders = await genderMap(usersData, [...new Set([...candidates, ...tagged])]);
			const genderOf = id => (genders[id] && genders[id].gender) || 0;

			let girl = null, boy = null;
			for (const id of tagged) {
				if (genderOf(id) === 2 && !girl) girl = id;
				else if (genderOf(id) === 1 && !boy) boy = id;
			}
			// tagged people whose gender is unknown (or repeated) still take the free spot: tags win
			const leftover = tagged.filter(id => id !== girl && id !== boy);
			if (!girl && leftover.length) girl = leftover.shift();
			if (!boy && leftover.length) boy = leftover.shift();

			// anyone still missing is picked at random (people whose gender was set by hand come first)
			const pickRandom = (gender, skip) => {
				const pool = candidates.filter(id => genderOf(id) === gender && !skip.includes(id));
				const manual = pool.filter(id => genders[id] && genders[id].manual);
				const list = manual.length ? manual : pool;
				return list.length ? list[Math.floor(Math.random() * list.length)] : null;
			};
			if (!girl) girl = pickRandom(2, [boy]);
			if (!boy) boy = pickRandom(1, [girl]);

			if (!girl || !boy) {
				const missing = !girl && !boy ? "a girl or a boy" : !girl ? "a girl" : "a boy";
				return message.reply(
					`❌ I couldn't find ${missing} in this group.\n` +
					"Members set their gender with: gender girl / gender boy\n" +
					"(admins can run: gender scan, to see who is still unknown)"
				);
			}
			const leftId = girl, rightId = boy;

			const rest = everyone.filter(id => id !== leftId && id !== rightId);
			const members = rest.slice(0, MAX_MEMBERS);
			const avatars = await loadAvatars(api, [leftId, rightId, ...members]);

			const width = 3200, size = 180, spacing = 40, rowStep = size + spacing + 30, perRow = 10;
			const gridWidth = perRow * (size + spacing) - spacing;
			const gridX = Math.round((width - gridWidth) / 2);
			const gridTop = 1480;
			const rows = Math.ceil(members.length / perRow);
			const height = Math.max(1900, gridTop + rows * rowStep + 220);
			const canvas = createCanvas(width, height);
			const ctx = canvas.getContext("2d");

			// background
			const bg = ctx.createLinearGradient(0, 0, width, height);
			bg.addColorStop(0, "#1b0a2a"); bg.addColorStop(0.5, "#2a0f3a"); bg.addColorStop(1, "#0d1b3a");
			ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
			const glowBg = ctx.createRadialGradient(width / 2, 800, 0, width / 2, 800, 1100);
			glowBg.addColorStop(0, "rgba(255,77,148,0.25)"); glowBg.addColorStop(1, "rgba(255,77,148,0)");
			ctx.fillStyle = glowBg; ctx.fillRect(0, 0, width, 1700);

			// group picture + name + stats
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
			ctx.fillText(`${everyone.length} Members  |  ${adminIDs.length} Admins`, width / 2, 450);

			// the couple
			const cy = 830, r = 230, gap = 520;
			drawCouplePerson(ctx, width / 2 - gap, cy, r, leftId, avatars, GIRL_COLOR, avatars.names[leftId]);
			drawCouplePerson(ctx, width / 2 + gap, cy, r, rightId, avatars, BOY_COLOR, avatars.names[rightId]);
			ctx.strokeStyle = "rgba(255,77,148,0.6)"; ctx.lineWidth = 8; ctx.setLineDash([22, 18]);
			ctx.beginPath(); ctx.moveTo(width / 2 - gap + r + 40, cy); ctx.lineTo(width / 2 - 150, cy); ctx.moveTo(width / 2 + 150, cy); ctx.lineTo(width / 2 + gap - r - 40, cy); ctx.stroke();
			ctx.setLineDash([]);
			heart(ctx, width / 2, cy, 90, "#ff2e63");

			// all other members
			ctx.font = "bold 56px Arial"; ctx.fillStyle = textColor; ctx.textAlign = "center";
			ctx.fillText("GC MEMBERS", width / 2, gridTop - 90);
			ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 3;
			roundRect(ctx, width / 2 - 260, gridTop - 70, 520, 4, 2); ctx.stroke();

			drawMemberGrid(ctx, members, avatars, {
				x0: gridX, y0: gridTop, perRow, size, spacing, rowStep,
				textColor, memberColor: "cyan", adminColor: "yellow", adminSet: new Set(adminIDs), glow
			});

			ctx.font = "30px Arial"; ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.textAlign = "center";
			ctx.fillText("couplegc", width / 2, height - 50);

			const buffer = exportJpeg(canvas, createCanvas);
			const coupleLine = `👧 ${avatars.names[leftId] || leftId}  ❤  👦 ${avatars.names[rightId] || rightId}`;
			const body = `💞 Couple GC\n${coupleLine}\n\n📌 Group: ${group.name}\n👥 Members: ${everyone.length}\n👑 Admins: ${adminIDs.length}` +
				(rest.length > MAX_MEMBERS ? `\n(showing first ${MAX_MEMBERS})` : "");
			return message.reply({ body, attachment: { buffer, fileName: "couplegc.jpg" } });
		}
		catch (err) {
			return message.reply(`❌ Error: ${err.message || err}`);
		}
	}
};
