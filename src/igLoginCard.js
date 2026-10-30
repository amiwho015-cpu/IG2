"use strict";

/**
 * A look-alike of Instagram's "Save your login info?" screen in a phone browser, for the prank "hack" command.
 * The clock is the real current time and the battery level / charging bolt change every time.
 * Drawn locally with plain canvas calls, no template image and no API.
 * Author: Shihab
 *
 *   render(Canvas, { username, avatar, timeText, battery, charging, tabs, speed })
 */

const W = 1130;
const H = 2576;
const FONT = "DejaVu Sans, Arial, sans-serif";

function roundRect(ctx, x, y, w, h, r) {
	r = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
}

function fit(ctx, text, weight, maxWidth, start, min = 24) {
	let size = start;
	do { ctx.font = `${weight} ${size}px ${FONT}`; size -= 2; }
	while (ctx.measureText(text).width > maxWidth && size > min);
}

function avatarCircle(ctx, img, cx, cy, r) {
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.closePath();
	ctx.clip();
	if (img) {
		const k = Math.max((r * 2) / img.width, (r * 2) / img.height);
		const w = img.width * k, h = img.height * k;
		ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
	}
	else {
		const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
		g.addColorStop(0, "#7e57c2"); g.addColorStop(1, "#ec407a");
		ctx.fillStyle = g;
		ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
		ctx.fillStyle = "rgba(255,255,255,0.85)";
		ctx.beginPath(); ctx.arc(cx, cy - r * 0.2, r * 0.32, 0, Math.PI * 2); ctx.fill();
		ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.75, r * 0.6, r * 0.42, 0, Math.PI, 0); ctx.fill();
	}
	ctx.restore();
}

function statusBar(ctx, o) {
	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "left";
	ctx.fillStyle = "#ffffff";
	ctx.font = `bold 31px ${FONT}`;
	ctx.fillText(o.timeText, 84, 79);
	const ix = 84 + ctx.measureText(o.timeText).width + 38;      // first icon follows the clock

	// three notification icons: Facebook, Gmail, a telecom app
	ctx.fillStyle = "#1877f2";
	ctx.beginPath(); ctx.arc(ix, 66, 20, 0, Math.PI * 2); ctx.fill();
	ctx.fillStyle = "#ffffff";
	ctx.font = `bold 28px ${FONT}`;
	ctx.fillText("f", ix - 6, 77);
	ctx.fillStyle = "#ffffff";
	roundRect(ctx, ix + 32, 46, 40, 40, 8); ctx.fill();
	ctx.fillStyle = "#ea4335";
	ctx.font = `bold 26px ${FONT}`;
	ctx.fillText("M", ix + 39, 75);
	ctx.fillStyle = "#0a9dd9";
	ctx.beginPath(); ctx.arc(ix + 102, 66, 20, 0, Math.PI * 2); ctx.fill();
	ctx.fillStyle = "#ffffff";
	ctx.font = `bold 32px ${FONT}`;
	ctx.fillText("...", ix + 134, 70);

	// network speed, mute, signal, wifi
	ctx.font = `22px ${FONT}`;
	ctx.fillStyle = "#e6e6e6";
	ctx.fillText(String(o.speed), 720, 56);
	ctx.fillText("K", 720, 78);
	ctx.strokeStyle = "#e6e6e6"; ctx.lineWidth = 4;
	ctx.beginPath(); ctx.arc(792, 66, 14, Math.PI, 0); ctx.lineTo(806, 80); ctx.lineTo(778, 80); ctx.closePath(); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(772, 88); ctx.lineTo(814, 46); ctx.stroke();
	for (let i = 0; i < 4; i++) { ctx.fillStyle = i < 3 ? "#ffffff" : "#8a8a8a"; ctx.fillRect(830 + i * 11, 78 - i * 8 - 8, 7, 14 + i * 8); }
	ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5;
	for (const r of [10, 20, 30]) { ctx.beginPath(); ctx.arc(912, 82, r, 1.25 * Math.PI, 1.75 * Math.PI); ctx.stroke(); }

	// battery
	const level = Math.max(1, Math.min(100, Math.round(o.battery)));
	const color = o.charging ? "#4cd964" : level <= 20 ? "#ff453a" : "#e6e6e6";
	ctx.fillStyle = color;
	roundRect(ctx, 958, 46, 74, 42, 12); ctx.fill();
	ctx.fillStyle = "#101010";
	ctx.font = `bold 30px ${FONT}`;
	ctx.textAlign = "center";
	ctx.fillText(String(level), 995, 77);
	ctx.textAlign = "left";
	if (o.charging) {
		ctx.fillStyle = "#ffffff";
		ctx.beginPath();
		ctx.moveTo(1062, 44); ctx.lineTo(1046, 68); ctx.lineTo(1058, 68); ctx.lineTo(1052, 92); ctx.lineTo(1072, 62); ctx.lineTo(1060, 62); ctx.closePath();
		ctx.fill();
	}
}

function browserBar(ctx, o) {
	ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.lineCap = "round";
	// home
	ctx.beginPath(); ctx.moveTo(42, 190); ctx.lineTo(67, 166); ctx.lineTo(92, 190); ctx.lineTo(92, 212); ctx.lineTo(42, 212); ctx.closePath(); ctx.stroke();
	// address pill
	ctx.fillStyle = "#44382b";
	roundRect(ctx, 136, 133, 577, 110, 55); ctx.fill();
	ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5;
	roundRect(ctx, 168, 186, 38, 30, 6); ctx.stroke();
	ctx.beginPath(); ctx.arc(187, 184, 12, Math.PI, 0); ctx.stroke();
	ctx.save();
	roundRect(ctx, 136, 133, 577, 110, 55); ctx.clip();
	ctx.fillStyle = "#ffffff";
	ctx.font = `39px ${FONT}`;
	ctx.fillText("instagram.com/?deoia=", 228, 202);
	ctx.restore();
	// new tab, tab counter, menu
	ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6;
	ctx.beginPath(); ctx.moveTo(782, 188); ctx.lineTo(828, 188); ctx.moveTo(805, 165); ctx.lineTo(805, 211); ctx.stroke();
	ctx.lineWidth = 5;
	roundRect(ctx, 915, 163, 50, 50, 9); ctx.stroke();
	ctx.fillStyle = "#ffffff";
	ctx.font = `bold 28px ${FONT}`;
	ctx.textAlign = "center";
	ctx.fillText(String(o.tabs), 940, 199);
	ctx.textAlign = "left";
	for (const dy of [-22, 0, 22]) { ctx.beginPath(); ctx.arc(1051, 188 + dy, 5, 0, Math.PI * 2); ctx.fill(); }
}

function pageBehind(ctx) {
	ctx.fillStyle = "#14161a";
	ctx.fillRect(0, 267, W, H - 267);
	ctx.fillStyle = "#6a6a6a";
	ctx.font = `italic bold 62px DejaVu Serif, Georgia, serif`;
	ctx.fillText("Instagram", 42, 346);
	ctx.strokeStyle = "#6a6a6a"; ctx.lineWidth = 5;
	ctx.beginPath(); ctx.moveTo(918, 328); ctx.lineTo(964, 328); ctx.moveTo(941, 305); ctx.lineTo(941, 351); ctx.stroke();
	ctx.lineWidth = 5;
	ctx.beginPath();
	ctx.moveTo(1052, 352); ctx.bezierCurveTo(1010, 326, 1014, 288, 1040, 288); ctx.bezierCurveTo(1048, 288, 1052, 294, 1052, 298);
	ctx.bezierCurveTo(1052, 294, 1058, 288, 1066, 288); ctx.bezierCurveTo(1092, 288, 1096, 326, 1052, 352);
	ctx.stroke();
	ctx.fillStyle = "#c0392b";
	ctx.beginPath(); ctx.arc(1084, 306, 14, 0, Math.PI * 2); ctx.fill();
	// bottom navigation (dimmed behind the sheet)
	ctx.strokeStyle = "#5a5a5a"; ctx.lineWidth = 6;
	ctx.fillStyle = "#5a5a5a";
	ctx.beginPath(); ctx.moveTo(114, 2490); ctx.lineTo(144, 2452); ctx.lineTo(174, 2490); ctx.lineTo(174, 2528); ctx.lineTo(114, 2528); ctx.closePath(); ctx.fill();
	ctx.beginPath(); ctx.arc(348, 2478, 24, 0, Math.PI * 2); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(366, 2496); ctx.lineTo(388, 2520); ctx.stroke();
	roundRect(ctx, 536, 2450, 58, 70, 14); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(556, 2472); ctx.lineTo(556, 2498); ctx.lineTo(578, 2485); ctx.closePath(); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(748, 2452); ctx.lineTo(776, 2486); ctx.lineTo(806, 2452); ctx.stroke();
	ctx.fillStyle = "#c0392b";
	ctx.beginPath(); ctx.arc(805, 2484, 24, 0, Math.PI * 2); ctx.fill();
	ctx.fillStyle = "#ffffff";
	ctx.font = `bold 26px ${FONT}`;
	ctx.textAlign = "center";
	ctx.fillText("3", 805, 2493);
	ctx.textAlign = "left";
	ctx.fillStyle = "#7a2a2a";
	ctx.beginPath(); ctx.arc(988, 2484, 32, 0, Math.PI * 2); ctx.fill();
}

function sheet(ctx, o) {
	// dim layer over the page, then the rounded sheet
	ctx.fillStyle = "rgba(0,0,0,0.55)";
	ctx.fillRect(0, 267, W, H - 267);
	ctx.fillStyle = "#1c1c1d";
	roundRect(ctx, 12, 358, W - 24, 2082, 64); ctx.fill();

	// close button
	ctx.fillStyle = "#3a3b3c";
	ctx.beginPath(); ctx.arc(1041, 447, 56, 0, Math.PI * 2); ctx.fill();
	ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 8; ctx.lineCap = "round";
	ctx.beginPath(); ctx.moveTo(1019, 425); ctx.lineTo(1063, 469); ctx.moveTo(1063, 425); ctx.lineTo(1019, 469); ctx.stroke();

	ctx.textAlign = "center";
	ctx.fillStyle = "#ffffff";
	fit(ctx, "Save your login info?", "bold", 900, 56);
	ctx.fillText("Save your login info?", W / 2, 660);

	ctx.fillStyle = "#f2f2f2";
	const body = ["We'll save the login info for Your", "Instagram account? so you won't need", "to enter it next time. Just click your", "profile photo to log in."];
	ctx.font = `40px ${FONT}`;
	body.forEach((line, i) => ctx.fillText(line, W / 2, 752 + i * 58));

	avatarCircle(ctx, o.avatar, 565, 1150, 142);

	ctx.fillStyle = "#ffffff";
	fit(ctx, o.username, "bold", 820, 40);
	ctx.fillText(o.username, 565, 1364);

	ctx.fillStyle = "#0064e0";
	roundRect(ctx, 56, 1460, 1018, 124, 62); ctx.fill();
	ctx.fillStyle = "#ffffff";
	ctx.font = `bold 36px ${FONT}`;
	ctx.fillText("Save Info", W / 2 - 2, 1536);

	ctx.fillStyle = "#2b2c2e";
	roundRect(ctx, 56, 1618, 1018, 124, 62); ctx.fill();
	ctx.fillStyle = "#a8a8a8";
	ctx.fillText("Not now", W / 2 - 2, 1694);

	// Meta mark: a small infinity sign and the word
	ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.lineJoin = "round";
	ctx.beginPath();
	for (let k = 0; k <= 48; k++) {
		const a = (Math.PI * 2 * k) / 48, d = 1 + Math.sin(a) * Math.sin(a);
		const x = 507 + (27 * Math.cos(a)) / d, y = 1849 + (29 * Math.sin(a) * Math.cos(a)) / d;
		if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
	}
	ctx.closePath();
	ctx.stroke();
	ctx.fillStyle = "#ffffff";
	ctx.textAlign = "left";
	ctx.font = `bold 39px ${FONT}`;
	ctx.fillText("Meta", 543, 1864);
	ctx.textAlign = "center";

	// gesture bar
	ctx.fillStyle = "#e6e6e6";
	roundRect(ctx, 352, 2548, 426, 10, 5); ctx.fill();
}

function render(Canvas, o) {
	const canvas = Canvas.createCanvas(W, H);
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "#2a2117";
	ctx.fillRect(0, 0, W, 267);
	pageBehind(ctx);
	sheet(ctx, o);
	statusBar(ctx, o);
	browserBar(ctx, o);
	return canvas.toBuffer("image/jpeg", { quality: 0.95 });
}

module.exports = { W, H, render };
