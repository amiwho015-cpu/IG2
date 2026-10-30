"use strict";

const { createCanvas } = require("canvas");
const { MAX_MEMBERS, roundRect, fetchImage, loadAvatars, drawFallback, getGroup, drawMemberGrid, exportJpeg } = require("../src/gcCard");

module.exports = {
	config: {
		name: "gcimg",
		aliases: ["gcimage"],
		version: "4.0",
		author: "Anik Islam Sadik",
		countDown: 5,
		role: 0,
		description: { en: "Generate a group card image with every member on one picture" },
		category: "image",
		guide: {
			en: "{pn} [options]   (all members on one picture)\n" +
				"--color <color>  text color (default white)\n" +
				"--admin <color>  admin border color (default yellow)\n" +
				"--member <color> member border color (default cyan)\n" +
				"--glow <color>   glow color (default none)\n" +
				"--opacity <0-1>  dark overlay opacity (default 0.6)\n" +
				"Example: {pn} --color white --glow gold --opacity 0.5"
		}
	},

	onStart: async function ({ api, args, event, message }) {
		try {
			let textColor = "white", memberColor = "cyan", adminColor = "yellow", glow = false, overlayOpacity = 0.6;
			for (let i = 0; i < args.length; i++) {
				if (args[i].startsWith("--")) {
					switch (args[i]) {
						case "--color": textColor = args[++i] || textColor; break;
						case "--admin": adminColor = args[++i] || adminColor; break;
						case "--member": memberColor = args[++i] || memberColor; break;
						case "--glow": glow = args[++i] || false; break;
						case "--opacity": { const v = parseFloat(args[++i]); if (!isNaN(v)) overlayOpacity = Math.min(Math.max(v, 0), 1); break; }
					}
				}
			}

			const group = await getGroup(api, event.threadID);
			const { everyone, adminIDs } = group;
			if (!everyone.length) return message.reply("❌ Could not read this group's members.");

			const members = everyone.slice(0, MAX_MEMBERS);
			const shownAdmins = adminIDs.slice(0, 5);
			const avatars = await loadAvatars(api, [...members, ...shownAdmins]);

			// every member on one picture: the canvas grows with the group size
			const size = 180, perRow = 8, spacing = 40, rowStep = size + spacing + 30;
			const rows = Math.ceil(members.length / perRow);
			const adminPanelH = 70 + shownAdmins.length * 170 + 40;
			const width = 3200;
			const height = Math.max(2000, 720 + rows * rowStep + 200, 650 + 30 + adminPanelH + 200);
			const canvas = createCanvas(width, height);
			const ctx = canvas.getContext("2d");

			const bg = await fetchImage("https://i.imgur.com/yBWS5ju.jpeg");
			if (bg) {
				ctx.drawImage(bg, 0, 0, width, height);
				ctx.fillStyle = `rgba(0,0,0,${overlayOpacity})`;
				ctx.fillRect(0, 0, width, height);
			}
			else {
				const g = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height));
				g.addColorStop(0, "#000000"); g.addColorStop(0.5, "#1a1a1a"); g.addColorStop(1, "#333333");
				ctx.fillStyle = g;
				ctx.fillRect(0, 0, width, height);
			}

			// corner rings
			ctx.strokeStyle = textColor; ctx.lineWidth = 3; ctx.globalAlpha = 0.2;
			[[100, 100], [width - 100, 100], [100, height - 100], [width - 100, height - 100]].forEach(([x, y]) => {
				ctx.beginPath(); ctx.arc(x, y, 80, 0, Math.PI * 2); ctx.stroke();
			});
			ctx.globalAlpha = 1;

			// group picture
			const groupImg = await fetchImage(group.info.imageSrc || group.info.thumbSrc);
			if (groupImg) {
				ctx.save();
				ctx.beginPath(); ctx.arc(width / 2, 200, 140, 0, Math.PI * 2); ctx.clip();
				ctx.drawImage(groupImg, width / 2 - 140, 60, 280, 280);
				ctx.restore();
				ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 3;
				ctx.beginPath(); ctx.arc(width / 2, 200, 140, 0, Math.PI * 2); ctx.stroke();
			}

			// title
			ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 15; ctx.shadowOffsetX = 5; ctx.shadowOffsetY = 5;
			ctx.font = "bold 80px Arial"; ctx.fillStyle = textColor; ctx.textAlign = "center";
			let groupName = group.name;
			if (groupName.length > 30) groupName = groupName.substring(0, 27) + "...";
			ctx.fillText(groupName, width / 2, 380);
			ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

			// stats card
			const cardWidth = 800, cardHeight = 150, cardX = width / 2 - cardWidth / 2, cardY = 430;
			ctx.fillStyle = "rgba(255,255,255,0.12)";
			roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 35); ctx.fill();
			ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 4;
			roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 35); ctx.stroke();
			ctx.font = "bold 48px Arial"; ctx.fillStyle = textColor;
			ctx.fillText(`${everyone.length} Members  |  ${adminIDs.length} Admins`, width / 2, 530);

			// members
			ctx.font = "bold 50px Arial"; ctx.fillStyle = textColor; ctx.textAlign = "left";
			ctx.fillText("MEMBERS", 120, 650);
			ctx.strokeStyle = memberColor; ctx.lineWidth = 3;
			ctx.beginPath(); ctx.moveTo(120, 670); ctx.lineTo(500, 670); ctx.stroke();

			drawMemberGrid(ctx, members, avatars, {
				x0: 120, y0: 720, perRow, size, spacing, rowStep,
				textColor, memberColor, adminColor, adminSet: new Set(adminIDs), glow
			});

			// admins
			const ax = 2200, ay = 650;
			ctx.save();
			ctx.font = "bold 50px Arial"; ctx.fillStyle = adminColor; ctx.textAlign = "left";
			ctx.fillText("ADMIN", ax, ay);
			ctx.strokeStyle = adminColor; ctx.lineWidth = 3;
			ctx.beginPath(); ctx.moveTo(ax, ay + 20); ctx.lineTo(ax + 350, ay + 20); ctx.stroke();
			ctx.fillStyle = "rgba(255,255,255,0.1)";
			roundRect(ctx, ax - 20, ay + 30, 700, adminPanelH, 25); ctx.fill();
			ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
			roundRect(ctx, ax - 20, ay + 30, 700, adminPanelH, 25); ctx.stroke();
			ctx.setLineDash([]);

			let adminY = ay + 70;
			for (let i = 0; i < shownAdmins.length; i++) {
				ctx.save();
				ctx.fillStyle = "rgba(255,255,255,0.15)";
				roundRect(ctx, ax, adminY, 650, 150, 15); ctx.fill();
				if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 15; }
				roundRect(ctx, ax + 20, adminY + 10, 120, 120, 15); ctx.clip();
				const img = avatars.images[shownAdmins[i]];
				if (img) ctx.drawImage(img, ax + 20, adminY + 10, 120, 120); else drawFallback(ctx, ax + 20, adminY + 10, 120);
				ctx.restore();

				ctx.save();
				ctx.strokeStyle = adminColor; ctx.lineWidth = 3;
				roundRect(ctx, ax + 20, adminY + 10, 120, 120, 15); ctx.stroke();
				ctx.font = "bold 30px Arial"; ctx.fillStyle = adminColor; ctx.textAlign = "left";
				ctx.fillText(`Admin #${i + 1}`, ax + 160, adminY + 50);
				ctx.font = "bold 40px Arial";
				ctx.fillText("★", ax + 570, adminY + 80);
				ctx.restore();
				adminY += 170;
			}
			ctx.restore();

			// footer
			const footerGradient = ctx.createLinearGradient(200, height - 80, width - 200, height - 80);
			footerGradient.addColorStop(0, textColor); footerGradient.addColorStop(0.5, adminColor); footerGradient.addColorStop(1, memberColor);
			ctx.strokeStyle = footerGradient; ctx.lineWidth = 3;
			ctx.beginPath(); ctx.moveTo(300, height - 80); ctx.lineTo(width - 300, height - 80); ctx.stroke();
			ctx.font = "30px Arial"; ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.textAlign = "center";
			ctx.fillText("gcimg", width / 2, height - 40);

			const buffer = exportJpeg(canvas, createCanvas);
			const body = `✨ Group Card\n\n📌 Group: ${group.name}\n👥 Members: ${everyone.length}\n👑 Admins: ${adminIDs.length}` +
				(everyone.length > MAX_MEMBERS ? `\n(showing first ${MAX_MEMBERS})` : "");

			return message.reply({ body, attachment: { buffer, fileName: "groupcard.jpg" } });
		}
		catch (err) {
			return message.reply(`❌ Error: ${err.message || err}`);
		}
	}
};
