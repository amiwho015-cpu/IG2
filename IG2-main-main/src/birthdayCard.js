"use strict";

/**
 * Birthday cards - 3 designs, long wishes, separate wishes for boys and girls.
 * Drawn with plain canvas calls (shapes only, no emoji glyphs) so it looks the
 * same on any host. Author: Shihab
 *
 *   design 1  ROYAL    purple + gold, balloons, party hat
 *   design 2  ROSE     rose + blush, hearts, flowers, ribbon banner
 *   design 3  MIDNIGHT navy + cyan/gold, fireworks, stars, crown
 */

const W = 1080;
const H = 1640;
const SANS = "DejaVu Sans, Arial, sans-serif";
const SERIF = "DejaVu Serif, Georgia, serif";

/* ------------------------------------------------------------------ wishes */

const WISHES = {
	boy: [
		"Happy Birthday, brother! May Allah fill your life with good health, endless success and a heart that stays strong in every storm. You are the kind of friend and person people are lucky to know. This new year of your life is the start of bigger dreams, bigger wins and bigger smiles. Keep shining, keep working hard, and never stop believing in yourself. Today is all yours - enjoy every single moment!",
		"Another year older, another year wiser, another year more legendary! Wishing you a birthday full of laughter, great food, loyal friends and zero worries. May every goal you chase turn into a story you are proud to tell. Stay humble, stay fearless and stay the same amazing guy you are. The world needs more people like you. Have the best day ever, champ!",
		"On your special day I pray that your path is always full of light and your pockets full of barakah. May your hard work finally meet its reward and every closed door open for you. Thank you for being strong, funny and always there when it matters. Eat lots of cake, make a big wish and let the whole year be your celebration. Happy Birthday, my friend!",
		"Happy Birthday to a real king! May this year bring you peace of mind, a bright career, money in your hands and happiness in your home. Don't ever let anyone dim your light - you were made to stand out. Keep chasing your dreams with the same fire and soon you will be standing on top. Enjoy your day to the fullest and party like there is no tomorrow!",
		"Wishing the most amazing guy a birthday as awesome as he is! May your days be filled with success, your nights with sweet sleep and your heart with endless gratitude. You make every room better just by walking in. May all your plans work out and may your dreams come true one by one. Many many happy returns of the day - this year is going to be yours!"
	],
	girl: [
		"Happy Birthday, beautiful! May your day be as lovely as your smile and your year as bright as your heart. You are kind, strong and a true blessing to everyone around you. I wish you endless happiness, good health, sweet surprises and all the success your heart desires. May every dream you whisper to the stars come true. Today is your day - shine like the princess you are!",
		"To the sweetest soul I know - Happy Birthday! May Allah shower you with love, peace and barakah in every moment of your life. Keep laughing the way only you can, keep glowing and keep being the amazing girl you are. May this new chapter bring you beautiful memories, wonderful people and everything you ever prayed for. Eat lots of cake and enjoy every second, my dear!",
		"Happy Birthday to a girl who lights up every room she walks into! I wish you a year full of joy, laughter, flowers and happy tears. May your hard work turn into success and your kindness come back to you a thousand times. You deserve all the love in this world and even more. Stay beautiful inside and out. Have the most magical birthday ever, queen!",
		"On this special day I send you all my love and duas. May your life be wrapped in happiness like a gift and your heart stay as soft and pure as ever. May every sad day behind you turn into a smile ahead of you. You are precious, you are loved and you are enough, always. Many many happy returns of the day, my sweetheart - make a wish and let it come true!",
		"Happy Birthday, my sunshine! May your day sparkle with surprises, your year bloom with success and your heart overflow with peace. You bring so much warmth and joy to everyone who knows you, and today the world celebrates you. May all your dreams grow wings and fly. Keep smiling, keep dreaming and keep being wonderfully you. Enjoy your special day to the fullest!"
	],
	any: [
		"Happy Birthday! Wishing you a day filled with love, laughter and endless joy. May Allah bless you with good health, happiness and success in everything you do. May every dream you hold close come true this year, and may every day bring you a reason to smile. You are special, you are loved and you truly deserve the very best. Enjoy your day to the fullest and make a big wish!",
		"Many many happy returns of the day! May this new year of your life bring you peace, prosperity and plenty of beautiful moments. Keep your heart kind, your mind strong and your smile alive. Thank you for being such a lovely part of our lives. Eat cake, laugh loudly and celebrate like it is the best day of the year - because today it is!"
	]
};

const DEFAULT_WISH = WISHES.any[0];

/** Pick a long wish for gender 1 (boy), 2 (girl) or anything else (neutral). Same person + same day = same wish. */
function pickWish(gender, seed) {
	const pool = gender === 1 ? WISHES.boy : gender === 2 ? WISHES.girl : WISHES.any;
	return pool[(seed >>> 0) % pool.length];
}

/* ----------------------------------------------------------------- helpers */

function rng(seed) {
	let s = seed >>> 0 || 1;
	return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function hash(text) {
	let h = 2166136261;
	for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
	return h;
}

function roundRect(ctx, x, y, w, h, r) {
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

function star(ctx, cx, cy, outer, inner, points = 4) {
	ctx.beginPath();
	for (let i = 0; i < points * 2; i++) {
		const r = i % 2 === 0 ? outer : inner;
		const a = (Math.PI * i) / points - Math.PI / 2;
		const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
		if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
	}
	ctx.closePath();
}

function heart(ctx, cx, cy, s) {
	ctx.beginPath();
	ctx.moveTo(cx, cy + s * 0.9);
	ctx.bezierCurveTo(cx - s * 1.4, cy - s * 0.1, cx - s * 0.7, cy - s * 1.1, cx, cy - s * 0.35);
	ctx.bezierCurveTo(cx + s * 0.7, cy - s * 1.1, cx + s * 1.4, cy - s * 0.1, cx, cy + s * 0.9);
	ctx.closePath();
}

function flower(ctx, cx, cy, size, petal, center, petals = 6) {
	ctx.save();
	ctx.translate(cx, cy);
	ctx.fillStyle = petal;
	for (let i = 0; i < petals; i++) {
		ctx.rotate((Math.PI * 2) / petals);
		ctx.beginPath();
		ctx.ellipse(0, -size * 0.58, size * 0.3, size * 0.5, 0, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.fillStyle = center;
	ctx.beginPath(); ctx.arc(0, 0, size * 0.28, 0, Math.PI * 2); ctx.fill();
	ctx.restore();
}

function fitFont(ctx, text, weight, family, maxWidth, start, min = 28) {
	let size = start;
	do { ctx.font = `${weight} ${size}px ${family}`; size -= 2; }
	while (ctx.measureText(text).width > maxWidth && size > min);
}

function wrap(ctx, text, maxWidth) {
	const lines = [];
	let line = "";
	for (const word of String(text).split(/\s+/).filter(Boolean)) {
		const test = line ? line + " " + word : word;
		if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
		else line = test;
	}
	if (line) lines.push(line);
	return lines;
}

function spaced(ctx, on, px) {
	if ("letterSpacing" in ctx) ctx.letterSpacing = on ? `${px}px` : "0px";
}

function lineWithStar(ctx, cx, y, half, gap, color) {
	ctx.strokeStyle = color;
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(cx - half, y); ctx.lineTo(cx - gap, y);
	ctx.moveTo(cx + gap, y); ctx.lineTo(cx + half, y);
	ctx.stroke();
	ctx.fillStyle = color;
	star(ctx, cx, y, 12, 4.5, 4);
	ctx.fill();
}

/* ------------------------------------------------------------------ themes */

const PHOTO = { cx: W / 2, cy: 660, r: 240 };

const THEMES = {
	1: {
		name: "royal",
		bg: ["#1c1163", "#6a1b9a", "#e0457b"],
		glow: ["rgba(255,224,130,0.55)", "rgba(255,183,77,0.16)", "rgba(255,183,77,0)"],
		accent: "#ffe082", accent2: "#ffca28",
		titleGrad: ["#fff8e1", "#ffd54f", "#ff9800"],
		panel: "rgba(15, 8, 50, 0.55)", panelLine: "rgba(255,224,130,0.85)",
		confetti: ["#ffd54f", "#ff80ab", "#80d8ff", "#b9f6ca", "#ffffff", "#ffab40", "#ea80fc"],
		top: "HAPPY", main: "BIRTHDAY"
	},
	2: {
		name: "rose",
		bg: ["#4a0d2e", "#b2285f", "#ffb199"],
		glow: ["rgba(255,214,224,0.6)", "rgba(255,160,190,0.18)", "rgba(255,160,190,0)"],
		accent: "#ffd9e2", accent2: "#f7b7a3",
		titleGrad: ["#ffffff", "#ffd1dc", "#f48fb1"],
		panel: "rgba(70, 8, 40, 0.5)", panelLine: "rgba(255,217,226,0.9)",
		confetti: ["#ffffff", "#ffc1d4", "#ff8fb1", "#ffe0b2", "#f8bbd0"],
		top: "HAPPY", main: "BIRTHDAY"
	},
	3: {
		name: "midnight",
		bg: ["#050b2e", "#0d2a63", "#0aa3b5"],
		glow: ["rgba(120,230,255,0.5)", "rgba(80,180,255,0.15)", "rgba(80,180,255,0)"],
		accent: "#8be9ff", accent2: "#ffd54f",
		titleGrad: ["#ffffff", "#9be7ff", "#29b6f6"],
		panel: "rgba(2, 8, 36, 0.6)", panelLine: "rgba(139,233,255,0.9)",
		confetti: ["#8be9ff", "#ffd54f", "#ffffff", "#b388ff", "#69f0ae"],
		top: "HAPPY", main: "BIRTHDAY"
	}
};

/* -------------------------------------------------------------- backgrounds */

function background(ctx, t) {
	const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
	g.addColorStop(0, t.bg[0]); g.addColorStop(0.5, t.bg[1]); g.addColorStop(1, t.bg[2]);
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, W, H);

	const glow = ctx.createRadialGradient(W / 2, PHOTO.cy, 40, W / 2, PHOTO.cy, 640);
	glow.addColorStop(0, t.glow[0]); glow.addColorStop(0.5, t.glow[1]); glow.addColorStop(1, t.glow[2]);
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, W, H);
}

/** true when (x, y) falls on a part of the card that must stay clear */
function reserved(x, y) {
	if (Math.hypot(x - PHOTO.cx, y - PHOTO.cy) < PHOTO.r + 95) return true;   // photo + frame
	if (y > 50 && y < 330 && x > 150 && x < 930) return true;                  // title
	if (y > 950 && y < 1640 && x > 50 && x < 1030) return true;                // name + wish + footer
	return false;
}

function confetti(ctx, seed, t) {
	const rand = rng(seed);
	for (let i = 0; i < 190; i++) {
		const x = rand() * W, y = rand() * H;
		if (reserved(x, y)) continue;
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(rand() * Math.PI);
		ctx.globalAlpha = 0.55 + rand() * 0.4;
		ctx.fillStyle = t.confetti[Math.floor(rand() * t.confetti.length)];
		const kind = rand();
		if (kind < 0.5) ctx.fillRect(-6, -3, 12 + rand() * 8, 6);
		else if (kind < 0.8) { ctx.beginPath(); ctx.arc(0, 0, 4 + rand() * 4, 0, Math.PI * 2); ctx.fill(); }
		else { star(ctx, 0, 0, 9, 3.5); ctx.fill(); }
		ctx.restore();
	}
}

/** Cover-fit an AI generated picture as the card background and darken it so the text stays readable. */
function aiBackground(ctx, img) {
	const k = Math.max(W / img.width, H / img.height);
	const w = img.width * k, h = img.height * k;
	ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
	const g = ctx.createLinearGradient(0, 0, 0, H);
	g.addColorStop(0, "rgba(0,0,0,0.30)");
	g.addColorStop(0.45, "rgba(0,0,0,0.10)");
	g.addColorStop(0.62, "rgba(0,0,0,0.38)");
	g.addColorStop(1, "rgba(0,0,0,0.58)");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, W, H);
}

/* ---------------------------------------------------------------- decor 1 */

function balloon(ctx, x, y, rx, ry, color, tilt) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(tilt);
	ctx.strokeStyle = "rgba(255,255,255,0.7)";
	ctx.lineWidth = 2.5;
	ctx.beginPath();
	ctx.moveTo(0, ry + 10);
	ctx.bezierCurveTo(-18, ry + 70, 22, ry + 120, -6, ry + 190);
	ctx.stroke();
	const g = ctx.createRadialGradient(-rx * 0.35, -ry * 0.4, rx * 0.1, 0, 0, ry * 1.1);
	g.addColorStop(0, "#ffffff");
	g.addColorStop(0.25, color);
	g.addColorStop(1, "rgba(0,0,0,0.35)");
	ctx.fillStyle = color;
	ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
	ctx.fillStyle = g;
	ctx.globalAlpha = 0.85;
	ctx.fill();
	ctx.globalAlpha = 1;
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(0, ry - 2); ctx.lineTo(-10, ry + 14); ctx.lineTo(10, ry + 14);
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = "rgba(255,255,255,0.55)";
	ctx.beginPath(); ctx.ellipse(-rx * 0.4, -ry * 0.45, rx * 0.14, ry * 0.26, -0.5, 0, Math.PI * 2); ctx.fill();
	ctx.restore();
}

function partyHat(ctx, x, y, angle) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(angle);
	const bw = 120, h = 165;
	const g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
	g.addColorStop(0, "#ff4081"); g.addColorStop(1, "#c2185b");
	ctx.shadowColor = "rgba(0,0,0,0.35)";
	ctx.shadowBlur = 16;
	ctx.fillStyle = g;
	ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(bw / 2, 0); ctx.lineTo(-bw / 2, 0); ctx.closePath(); ctx.fill();
	ctx.shadowBlur = 0;
	ctx.save();
	ctx.clip();
	ctx.strokeStyle = "#ffe082";
	ctx.lineWidth = 12;
	for (let i = 1; i <= 3; i++) {
		ctx.beginPath();
		ctx.moveTo(-bw, -i * 42 + 24); ctx.lineTo(bw, -i * 42 - 24);
		ctx.stroke();
	}
	ctx.fillStyle = "#ffffff";
	for (const [dx, dy] of [[-22, -40], [26, -62], [-8, -112], [18, -150], [-34, -86]]) {
		ctx.beginPath(); ctx.arc(dx, dy, 6, 0, Math.PI * 2); ctx.fill();
	}
	ctx.restore();
	ctx.fillStyle = "#ffe082";
	roundRect(ctx, -bw / 2 - 4, -6, bw + 8, 16, 8);
	ctx.fill();
	const pom = ctx.createRadialGradient(-4, -h - 4, 2, 0, -h, 24);
	pom.addColorStop(0, "#ffffff"); pom.addColorStop(1, "#ffd54f");
	ctx.fillStyle = pom;
	ctx.beginPath(); ctx.arc(0, -h, 22, 0, Math.PI * 2); ctx.fill();
	ctx.restore();
}

function decorRoyal(ctx) {
	balloon(ctx, 85, 270, 58, 73, "#ff5252", -0.16);
	balloon(ctx, 170, 480, 52, 66, "#ffd740", 0.12);
	balloon(ctx, 62, 700, 48, 62, "#40c4ff", 0.2);
	balloon(ctx, 995, 270, 58, 73, "#69f0ae", 0.16);
	balloon(ctx, 910, 480, 52, 66, "#ff80ab", -0.12);
	balloon(ctx, 1018, 700, 48, 62, "#b388ff", -0.2);
}

/* ---------------------------------------------------------------- decor 2 */

function decorRose(ctx, seed) {
	const rand = rng(seed ^ 0x9e3779b9);
	// floating hearts
	for (let i = 0; i < 46; i++) {
		const x = rand() * W, y = rand() * 950;
		if (reserved(x, y)) { rand(); rand(); continue; }
		ctx.save();
		ctx.globalAlpha = 0.25 + rand() * 0.5;
		ctx.fillStyle = rand() < 0.5 ? "#ffffff" : "#ffb3c7";
		heart(ctx, x, y, 8 + rand() * 18);
		ctx.fill();
		ctx.restore();
	}
	// flower garlands in the corners
	const spots = [[70, 90, 52], [165, 55, 38], [40, 215, 40], [1010, 90, 52], [915, 55, 38], [1040, 215, 40],
		[60, 840, 46], [1020, 840, 46], [120, 780, 32], [960, 780, 32]];
	spots.forEach(([x, y, s], i) => flower(ctx, x, y, s, i % 2 ? "#ffd1dc" : "#ffffff", "#ffb74d", 7));
	// side vines of small leaves
	ctx.fillStyle = "rgba(255,255,255,0.28)";
	for (let i = 0; i < 10; i++) {
		ctx.beginPath(); ctx.ellipse(28, 300 + i * 52, 9, 20, 0.6, 0, Math.PI * 2); ctx.fill();
		ctx.beginPath(); ctx.ellipse(1052, 300 + i * 52, 9, 20, -0.6, 0, Math.PI * 2); ctx.fill();
	}
}

/* ---------------------------------------------------------------- decor 3 */

function firework(ctx, cx, cy, radius, color, rays = 18) {
	ctx.save();
	ctx.strokeStyle = color;
	ctx.fillStyle = color;
	ctx.lineWidth = 3;
	ctx.lineCap = "round";
	for (let i = 0; i < rays; i++) {
		const a = (Math.PI * 2 * i) / rays;
		const r1 = radius * 0.35, r2 = radius * (i % 2 ? 0.8 : 1);
		ctx.globalAlpha = 0.9;
		ctx.beginPath();
		ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
		ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
		ctx.stroke();
		ctx.globalAlpha = 0.75;
		ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (r2 + 14), cy + Math.sin(a) * (r2 + 14), 3.5, 0, Math.PI * 2); ctx.fill();
	}
	ctx.restore();
}

function decorMidnight(ctx, seed) {
	const rand = rng(seed ^ 0x85ebca6b);
	// star field
	for (let i = 0; i < 120; i++) {
		const x = rand() * W, y = rand() * H;
		if (reserved(x, y)) { rand(); continue; }
		ctx.globalAlpha = 0.35 + rand() * 0.6;
		ctx.fillStyle = "#ffffff";
		ctx.beginPath(); ctx.arc(x, y, 1 + rand() * 2.4, 0, Math.PI * 2); ctx.fill();
	}
	ctx.globalAlpha = 1;
	firework(ctx, 120, 330, 95, "#ffd54f");
	firework(ctx, 975, 280, 85, "#8be9ff");
	firework(ctx, 90, 760, 70, "#b388ff");
	firework(ctx, 990, 780, 78, "#69f0ae");
	firework(ctx, 190, 120, 55, "#ff80ab", 14);
	firework(ctx, 900, 110, 58, "#ffffff", 14);
}

function crown(ctx, x, y, s) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(0.28);
	ctx.shadowColor = "rgba(0,0,0,0.4)";
	ctx.shadowBlur = 14;
	const g = ctx.createLinearGradient(0, -s, 0, s * 0.5);
	g.addColorStop(0, "#fff3c4"); g.addColorStop(0.5, "#ffca28"); g.addColorStop(1, "#ff8f00");
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.moveTo(-s, s * 0.5);
	ctx.lineTo(-s * 1.05, -s * 0.55);
	ctx.lineTo(-s * 0.5, -s * 0.05);
	ctx.lineTo(0, -s * 0.8);
	ctx.lineTo(s * 0.5, -s * 0.05);
	ctx.lineTo(s * 1.05, -s * 0.55);
	ctx.lineTo(s, s * 0.5);
	ctx.closePath();
	ctx.fill();
	ctx.shadowBlur = 0;
	ctx.fillStyle = "#e53935";
	ctx.beginPath(); ctx.arc(0, s * 0.18, s * 0.13, 0, Math.PI * 2); ctx.fill();
	ctx.fillStyle = "#29b6f6";
	ctx.beginPath(); ctx.arc(-s * 0.55, s * 0.22, s * 0.1, 0, Math.PI * 2); ctx.fill();
	ctx.beginPath(); ctx.arc(s * 0.55, s * 0.22, s * 0.1, 0, Math.PI * 2); ctx.fill();
	ctx.fillStyle = "#ffffff";
	for (const [dx, dy] of [[-1.05, -0.55], [0, -0.8], [1.05, -0.55]]) { ctx.beginPath(); ctx.arc(dx * s, dy * s, s * 0.1, 0, Math.PI * 2); ctx.fill(); }
	ctx.restore();
}

/* ------------------------------------------------------------------- title */

/** Design 1: "HAPPY BIRTHDAY" on a string of party flags. */
function bunting(ctx, t) {
	const text = "HAPPY BIRTHDAY";
	const x0 = 60, x1 = 1020, y0 = 62, sag = 64;
	ctx.save();
	ctx.strokeStyle = "rgba(255,255,255,0.85)";
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.moveTo(x0, y0);
	ctx.quadraticCurveTo((x0 + x1) / 2, y0 + sag * 2, x1, y0);
	ctx.stroke();
	const n = text.length;
	for (let i = 0; i < n; i++) {
		const ch = text[i];
		if (ch === " ") continue;
		const k = (i + 0.5) / n;
		const x = x0 + (x1 - x0) * k;
		const y = y0 + 4 * sag * k * (1 - k);
		const angle = Math.atan2(4 * sag * (1 - 2 * k), x1 - x0);
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(angle);
		ctx.shadowColor = "rgba(0,0,0,0.4)";
		ctx.shadowBlur = 10;
		ctx.shadowOffsetY = 4;
		ctx.fillStyle = t.confetti[i % t.confetti.length];
		ctx.beginPath(); ctx.moveTo(-31, 0); ctx.lineTo(31, 0); ctx.lineTo(0, 96); ctx.closePath(); ctx.fill();
		ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
		ctx.strokeStyle = "rgba(255,255,255,0.75)";
		ctx.lineWidth = 3;
		ctx.stroke();
		ctx.fillStyle = "#3a1466";
		ctx.textAlign = "center";
		ctx.font = `bold 40px ${SERIF}`;
		ctx.fillText(ch, 0, 44);
		ctx.restore();
	}
	ctx.restore();

	ctx.textAlign = "center";
	ctx.fillStyle = t.accent;
	ctx.font = `bold 26px ${SANS}`;
	spaced(ctx, true, 8);
	ctx.fillText("MAY ALL YOUR WISHES COME TRUE", W / 2 + 4, 292);
	spaced(ctx, false);
}

/** Design 3: a neon sign. */
function neonTitle(ctx, t) {
	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	ctx.save();
	ctx.fillStyle = t.accent;
	ctx.shadowColor = "#29b6f6";
	ctx.shadowBlur = 24;
	ctx.font = `bold 46px ${SANS}`;
	spaced(ctx, true, 18);
	ctx.fillText("HAPPY", W / 2 + 9, 128);
	spaced(ctx, false);

	fitFont(ctx, "BIRTHDAY", "bold", SANS, 800, 126, 60);
	ctx.lineJoin = "round";
	ctx.strokeStyle = "#8be9ff";
	ctx.lineWidth = 6;
	ctx.shadowColor = "#29b6f6";
	ctx.shadowBlur = 45;
	ctx.strokeText("BIRTHDAY", W / 2, 252);
	ctx.strokeText("BIRTHDAY", W / 2, 252);
	ctx.shadowBlur = 0;
	ctx.fillStyle = "rgba(4, 14, 58, 0.88)";
	ctx.fillText("BIRTHDAY", W / 2, 252);
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 1.8;
	ctx.strokeText("BIRTHDAY", W / 2, 252);
	ctx.restore();
	lineWithStar(ctx, W / 2, 288, 160, 26, t.accent2);
}

function title(ctx, t, theme) {
	if (theme === 1) return bunting(ctx, t);
	if (theme === 3) return neonTitle(ctx, t);

	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	ctx.save();
	ctx.shadowColor = "rgba(0,0,0,0.45)";
	ctx.shadowBlur = 14;
	ctx.shadowOffsetY = 4;

	ctx.fillStyle = t.accent;
	ctx.font = `bold 44px ${SANS}`;
	spaced(ctx, true, 14);
	ctx.fillText(t.top, W / 2 + 7, 130);
	spaced(ctx, false);

	const g = ctx.createLinearGradient(0, 140, 0, 255);
	g.addColorStop(0, t.titleGrad[0]); g.addColorStop(0.55, t.titleGrad[1]); g.addColorStop(1, t.titleGrad[2]);
	ctx.fillStyle = g;
	fitFont(ctx, t.main, "bold", SERIF, 760, 132, 60);
	ctx.fillText(t.main, W / 2, 250);
	ctx.restore();

	lineWithStar(ctx, W / 2, 285, 160, 26, t.accent);
}

/* ------------------------------------------------------------------- photo */

/**
 * Photo shapes, one per design (all sit inside a 500 x 500 box centred on the photo spot):
 *   1 arch (window), 2 heart, 3 hexagon
 */
const SHAPES = {
	1(ctx, cx, cy) {
		const w = 430, top = cy - 250, bottom = cy + 235, rad = w / 2, corner = 28;
		ctx.beginPath();
		ctx.moveTo(cx - rad, bottom - corner);
		ctx.lineTo(cx - rad, top + rad);
		ctx.arc(cx, top + rad, rad, Math.PI, 0);
		ctx.lineTo(cx + rad, bottom - corner);
		ctx.quadraticCurveTo(cx + rad, bottom, cx + rad - corner, bottom);
		ctx.lineTo(cx - rad + corner, bottom);
		ctx.quadraticCurveTo(cx - rad, bottom, cx - rad, bottom - corner);
		ctx.closePath();
	},
	2(ctx, cx, cy) {
		const k = 15;
		ctx.beginPath();
		for (let i = 0; i <= 120; i++) {
			const a = (Math.PI * 2 * i) / 120;
			const x = 16 * Math.pow(Math.sin(a), 3);
			const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
			const px = cx + x * k, py = cy - (y + 2.5) * k;
			if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
		}
		ctx.closePath();
	},
	3(ctx, cx, cy) {
		const R = 238;
		ctx.beginPath();
		for (let i = 0; i < 6; i++) {
			const a = -Math.PI / 2 + (Math.PI * i) / 3;
			const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
			if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
		}
		ctx.closePath();
	}
};

function drawPhoto(ctx, img, theme, cx, cy) {
	const shape = SHAPES[theme] || SHAPES[1];
	const box = 500;
	ctx.save();
	shape(ctx, cx, cy);
	ctx.clip();
	if (img) {
		const side = Math.min(img.width, img.height);
		ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, cx - box / 2, cy - box / 2, box, box);
	}
	else {
		const g = ctx.createLinearGradient(cx - box / 2, cy - box / 2, cx + box / 2, cy + box / 2);
		g.addColorStop(0, "#7e57c2"); g.addColorStop(1, "#ec407a");
		ctx.fillStyle = g;
		ctx.fillRect(cx - box / 2, cy - box / 2, box, box);
		ctx.fillStyle = "rgba(255,255,255,0.85)";
		ctx.beginPath(); ctx.arc(cx, cy - 55, 75, 0, Math.PI * 2); ctx.fill();
		ctx.beginPath(); ctx.ellipse(cx, cy + 150, 135, 95, 0, Math.PI, 0); ctx.fill();
	}
	ctx.restore();
}

function shapeFrame(ctx, theme, cx, cy, colors, glowColor) {
	const shape = SHAPES[theme] || SHAPES[1];
	ctx.save();
	ctx.lineJoin = "round";
	shape(ctx, cx, cy);
	ctx.shadowColor = glowColor;
	ctx.shadowBlur = 55;
	ctx.strokeStyle = glowColor;
	ctx.lineWidth = 46;
	ctx.globalAlpha = 0.35;
	ctx.stroke();
	ctx.restore();

	ctx.save();
	ctx.lineJoin = "round";
	const g = ctx.createLinearGradient(cx - 250, cy - 250, cx + 250, cy + 250);
	g.addColorStop(0, colors[0]); g.addColorStop(0.3, colors[1]); g.addColorStop(0.6, colors[2]); g.addColorStop(1, colors[3]);
	shape(ctx, cx, cy);
	ctx.strokeStyle = g;
	ctx.lineWidth = 42;
	ctx.stroke();
	shape(ctx, cx, cy);
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 5;
	ctx.stroke();
	ctx.restore();
}

function frame(ctx, theme, cx, cy) {
	if (theme === 2) {
		shapeFrame(ctx, 2, cx, cy, ["#ffe9ee", "#f8bbd0", "#f06292", "#ffd9e2"], "rgba(255,182,203,0.95)");
		for (const [dx, dy, s] of [[-285, -150, 20], [292, 60, 17], [-300, 110, 15], [270, -190, 16], [0, -270, 14]]) {
			ctx.fillStyle = "#fff0f4";
			heart(ctx, cx + dx, cy + dy, s);
			ctx.fill();
		}
	}
	else if (theme === 3) {
		shapeFrame(ctx, 3, cx, cy, ["#e1f9ff", "#4dd0e1", "#0288d1", "#b3e5fc"], "rgba(100,220,255,0.95)");
		for (const [dx, dy, s] of [[-300, -150, 24], [300, 90, 20], [-290, 150, 17], [0, -300, 18], [292, -120, 16]]) {
			ctx.fillStyle = "#e1f9ff";
			star(ctx, cx + dx, cy + dy, s, s * 0.28, 4);
			ctx.fill();
		}
	}
	else {
		shapeFrame(ctx, 1, cx, cy, ["#fff3c4", "#ffca28", "#ff8f00", "#ffe082"], "rgba(255,213,79,0.95)");
		for (const [dx, dy, s] of [[-285, -190, 26], [285, 110, 22], [-290, 130, 18], [270, -230, 20], [0, -285, 16]]) {
			ctx.fillStyle = "#fff8e1";
			star(ctx, cx + dx, cy + dy, s, s * 0.28, 4);
			ctx.fill();
		}
	}
}

/* -------------------------------------------------------------- text parts */

function nameBlock(ctx, name, t) {
	ctx.textAlign = "center";
	ctx.save();
	ctx.shadowColor = "rgba(0,0,0,0.5)";
	ctx.shadowBlur = 12;
	ctx.shadowOffsetY = 3;
	ctx.fillStyle = "#ffffff";
	fitFont(ctx, name, "bold", SANS, 880, 72, 34);
	ctx.fillText(name, W / 2, 1010);
	ctx.restore();
	lineWithStar(ctx, W / 2, 1040, 130, 24, t.accent);
}

/** The long wish inside a soft panel. The font shrinks until the whole wish fits. */
function wishBlock(ctx, wish, t) {
	const x = 70, y = 1070, w = W - 140, h = 400, padX = 52, padY = 34;
	ctx.fillStyle = t.panel;
	roundRect(ctx, x, y, w, h, 34);
	ctx.fill();
	ctx.strokeStyle = t.panelLine;
	ctx.lineWidth = 3;
	roundRect(ctx, x, y, w, h, 34);
	ctx.stroke();

	// corner sparkles
	ctx.fillStyle = t.accent;
	for (const [sx, sy] of [[x + 26, y + 26], [x + w - 26, y + 26], [x + 26, y + h - 26], [x + w - 26, y + h - 26]]) {
		star(ctx, sx, sy, 11, 4, 4);
		ctx.fill();
	}

	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = "rgba(255,255,255,0.95)";
	const maxW = w - padX * 2, maxH = h - padY * 2;
	let size = 33, lines = [], lh = 0;
	for (; size >= 20; size -= 1) {
		ctx.font = `italic ${size}px ${SERIF}`;
		lines = wrap(ctx, wish, maxW);
		lh = Math.round(size * 1.42);
		if (lines.length * lh <= maxH) break;
	}
	const total = lines.length * lh;
	const top = y + (h - total) / 2 + size * 0.9;
	lines.forEach((line, i) => ctx.fillText(line, W / 2, top + i * lh));
}

function footer(ctx, dateLine, timeLine, t) {
	const y = 1510, h = 100;
	ctx.fillStyle = t.panel;
	roundRect(ctx, 90, y, W - 180, h, 28);
	ctx.fill();
	ctx.strokeStyle = t.panelLine;
	ctx.lineWidth = 3;
	roundRect(ctx, 90, y, W - 180, h, 28);
	ctx.stroke();

	ctx.textAlign = "center";
	ctx.fillStyle = t.accent;
	fitFont(ctx, dateLine, "bold", SANS, 800, 40, 24);
	ctx.fillText(dateLine, W / 2, y + 46);
	ctx.fillStyle = "#ffffff";
	ctx.font = `28px ${SANS}`;
	ctx.fillText(timeLine, W / 2, y + 84);
}

/** Ribbon banner across the bottom of the photo - design 2 only. */
function ribbon(ctx, text, t) {
	const cx = W / 2, y = PHOTO.cy + 168, w = 380, h = 50;
	ctx.fillStyle = "#e91e63";
	ctx.beginPath(); ctx.moveTo(cx - w / 2 - 40, y + 8); ctx.lineTo(cx - w / 2 + 14, y + 8); ctx.lineTo(cx - w / 2 + 14, y + h + 8); ctx.lineTo(cx - w / 2 - 40, y + h + 8); ctx.lineTo(cx - w / 2 - 18, y + h / 2 + 8); ctx.closePath(); ctx.fill();
	ctx.beginPath(); ctx.moveTo(cx + w / 2 + 40, y + 8); ctx.lineTo(cx + w / 2 - 14, y + 8); ctx.lineTo(cx + w / 2 - 14, y + h + 8); ctx.lineTo(cx + w / 2 + 40, y + h + 8); ctx.lineTo(cx + w / 2 + 18, y + h / 2 + 8); ctx.closePath(); ctx.fill();
	const g = ctx.createLinearGradient(0, y, 0, y + h);
	g.addColorStop(0, "#ff5c8d"); g.addColorStop(1, "#d81b60");
	ctx.fillStyle = g;
	roundRect(ctx, cx - w / 2, y, w, h, 10);
	ctx.fill();
	ctx.fillStyle = "#ffffff";
	ctx.textAlign = "center";
	ctx.font = `bold 26px ${SANS}`;
	spaced(ctx, true, 5);
	ctx.fillText(text, cx + 2, y + 36);
	spaced(ctx, false);
}


/* ============================================================ unique designs */
/*  4  POLAROID  scrapbook: bunting, taped polaroid, lined note paper            */
/*  5  ARCH      boho rainbow arch window on a night sky, balloons               */
/*  6  LICENSE   "Birthday License" ID card with a barcode, as a joke card       */

function paintAvatar(ctx, img, x, y, w, h) {
	if (img) {
		const k = Math.max(w / img.width, h / img.height);
		const dw = img.width * k, dh = img.height * k;
		ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
		return;
	}
	const g = ctx.createLinearGradient(x, y, x + w, y + h);
	g.addColorStop(0, "#7e57c2"); g.addColorStop(1, "#ec407a");
	ctx.fillStyle = g;
	ctx.fillRect(x, y, w, h);
	const m = Math.min(w, h);
	ctx.fillStyle = "rgba(255,255,255,0.85)";
	ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.38, m * 0.17, 0, Math.PI * 2); ctx.fill();
	ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.9, m * 0.32, m * 0.26, 0, Math.PI, 0); ctx.fill();
}

/** A wish inside the box (x, y, w, h); the font shrinks until all of it fits. o: color, ruled, size, padX, padY, style, family */
function wishBox(ctx, wish, x, y, w, h, o) {
	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = o.color;
	const maxW = w - (o.padX || 48) * 2, maxH = h - (o.padY || 28) * 2;
	let size = o.size || 33, lines = [], lh = 0;
	for (; size >= 20; size--) {
		ctx.font = `${o.style || "italic"} ${size}px ${o.family || SERIF}`;
		lines = wrap(ctx, wish, maxW);
		lh = Math.round(size * 1.42);
		if (lines.length * lh <= maxH) break;
	}
	const top = y + (h - lines.length * lh) / 2 + size * 0.9;
	lines.forEach((line, i) => {
		const by = top + i * lh;
		if (o.ruled) {
			ctx.strokeStyle = o.ruled;
			ctx.lineWidth = 2;
			ctx.beginPath(); ctx.moveTo(x + 36, by + size * 0.32); ctx.lineTo(x + w - 36, by + size * 0.32); ctx.stroke();
		}
		ctx.fillText(line, x + w / 2, by);
	});
}

function softShadow(ctx, on, blur = 30, dy = 14, alpha = 0.28) {
	ctx.shadowColor = on ? `rgba(0,0,0,${alpha})` : "rgba(0,0,0,0)";
	ctx.shadowBlur = on ? blur : 0;
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = on ? dy : 0;
}

/* ------------------------------------------------------------ 4  polaroid */

function uniquePolaroid(ctx, o, name) {
	const rand = rng(hash(name));
	ctx.fillStyle = "#f4e9d8";
	ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = "rgba(120,90,60,0.08)";
	for (let y = 24; y < H; y += 36) for (let x = 24; x < W; x += 36) { ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill(); }

	const pastel = ["#ef6f6c", "#f6c85f", "#6fb98f", "#5b8def", "#b388eb", "#ff9bb3"];
	for (let i = 0; i < 90; i++) {
		ctx.save();
		ctx.translate(rand() * W, rand() * H);
		ctx.rotate(rand() * Math.PI);
		ctx.globalAlpha = 0.5 + rand() * 0.4;
		ctx.fillStyle = pastel[Math.floor(rand() * pastel.length)];
		ctx.fillRect(-8, -3, 16 + rand() * 8, 6);
		ctx.restore();
	}

	// bunting flags along a sagging string
	const yq = t => (1 - t) * (1 - t) * 70 + 2 * (1 - t) * t * 190 + t * t * 70;
	ctx.strokeStyle = "#5a4636";
	ctx.lineWidth = 4;
	ctx.beginPath(); ctx.moveTo(-20, 70); ctx.quadraticCurveTo(W / 2, 190, W + 20, 70); ctx.stroke();
	const flags = 11;
	for (let i = 0; i < flags; i++) {
		const t = (i + 0.5) / flags, x = -20 + (W + 40) * t, y = yq(t);
		ctx.fillStyle = pastel[i % pastel.length];
		ctx.beginPath(); ctx.moveTo(x - 36, y); ctx.lineTo(x + 36, y); ctx.lineTo(x, y + 104); ctx.closePath(); ctx.fill();
		ctx.fillStyle = "rgba(255,255,255,0.35)";
		ctx.beginPath(); ctx.moveTo(x - 36, y); ctx.lineTo(x - 8, y); ctx.lineTo(x, y + 104); ctx.closePath(); ctx.fill();
	}

	// title with an offset "print" shadow
	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	ctx.font = `italic bold 84px ${SERIF}`;
	ctx.fillStyle = "#f6c85f"; ctx.fillText("Happy", W / 2 + 5, 345 + 5);
	ctx.fillStyle = "#e4572e"; ctx.fillText("Happy", W / 2, 345);
	fitFont(ctx, "Birthday!", "bold", SERIF, 860, 150, 60);
	ctx.fillStyle = "#e4572e"; ctx.fillText("Birthday!", W / 2 + 6, 485 + 6);
	ctx.fillStyle = "#2f2a4a"; ctx.fillText("Birthday!", W / 2, 485);

	// taped polaroid, slightly turned
	ctx.save();
	ctx.translate(540, 850);
	ctx.rotate(-0.05);
	softShadow(ctx, true, 34, 16, 0.3);
	ctx.fillStyle = "#ffffff";
	roundRect(ctx, -270, -320, 540, 640, 10);
	ctx.fill();
	softShadow(ctx, false);
	ctx.save();
	ctx.beginPath(); ctx.rect(-240, -290, 480, 480); ctx.clip();
	paintAvatar(ctx, o.img, -240, -290, 480, 480);
	ctx.restore();
	ctx.strokeStyle = "rgba(0,0,0,0.12)";
	ctx.lineWidth = 2;
	ctx.strokeRect(-240, -290, 480, 480);
	ctx.fillStyle = "#3a2f2a";
	ctx.textAlign = "center";
	fitFont(ctx, name, "italic bold", SERIF, 420, 56, 30);
	ctx.fillText(name, 0, 272);
	ctx.fillStyle = "#ef6f6c";
	heart(ctx, -222, 252, 11); ctx.fill();
	heart(ctx, 222, 252, 11); ctx.fill();
	for (const side of [-1, 1]) {
		ctx.save();
		ctx.translate(side * 250, -318);
		ctx.rotate(side * 0.6);
		ctx.fillStyle = "rgba(255,226,140,0.82)";
		ctx.fillRect(-66, -21, 132, 42);
		ctx.strokeStyle = "rgba(190,150,60,0.35)";
		ctx.lineWidth = 2;
		ctx.strokeRect(-66, -21, 132, 42);
		ctx.restore();
	}
	ctx.restore();

	// stickers
	ctx.save();
	ctx.lineJoin = "round";
	ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 10;
	ctx.fillStyle = "#ffd23f";
	star(ctx, 880, 610, 62, 28, 5); ctx.stroke(); ctx.fill();
	ctx.fillStyle = "#ef6f6c";
	heart(ctx, 175, 1130, 40); ctx.stroke(); ctx.fill();
	ctx.restore();
	flower(ctx, 200, 640, 58, "#ffb3c1", "#fff3b0", 7);
	flower(ctx, 905, 1090, 48, "#b8e0ff", "#fff3b0", 6);

	// lined note paper
	ctx.save();
	ctx.translate(540, 1348);
	ctx.rotate(0.012);
	softShadow(ctx, true, 24, 10, 0.22);
	ctx.fillStyle = "#fffdf7";
	roundRect(ctx, -450, -143, 900, 286, 16);
	ctx.fill();
	softShadow(ctx, false);
	wishBox(ctx, o.wish || DEFAULT_WISH, -450, -143, 900, 286, { color: "#4a3b32", ruled: "rgba(100,140,200,0.38)", size: 30, padX: 56, padY: 20 });
	ctx.fillStyle = "rgba(255,226,140,0.85)";
	ctx.fillRect(-70, -164, 140, 38);
	ctx.restore();

	footer(ctx, o.dateLine, o.timeLine, { panel: "rgba(74,59,50,0.9)", panelLine: "rgba(255,255,255,0.9)", accent: "#ffd8a8" });
}

/* --------------------------------------------------------------- 5  arch */

function archPath(ctx, cx, cy, r, bottom) {
	ctx.beginPath();
	ctx.moveTo(cx - r, bottom);
	ctx.lineTo(cx - r, cy);
	ctx.arc(cx, cy, r, Math.PI, 0);
	ctx.lineTo(cx + r, bottom);
}

function uniqueArch(ctx, o, name) {
	const rand = rng(hash(name) ^ 0x51ed270b);
	const g = ctx.createLinearGradient(0, 0, 0, H);
	g.addColorStop(0, "#120f33"); g.addColorStop(0.55, "#2b1a58"); g.addColorStop(1, "#4a2370");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, W, H);

	const glow = ctx.createRadialGradient(540, 700, 40, 540, 700, 620);
	glow.addColorStop(0, "rgba(255,190,150,0.35)"); glow.addColorStop(1, "rgba(255,190,150,0)");
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, W, H);

	for (let i = 0; i < 110; i++) {
		const x = rand() * W, y = rand() * H;
		if (x > 120 && x < 960 && y > 80 && y < 1010) continue;
		ctx.globalAlpha = 0.3 + rand() * 0.6;
		ctx.fillStyle = "#ffffff";
		if (rand() < 0.2) { star(ctx, x, y, 7 + rand() * 6, 2.5, 4); ctx.fill(); }
		else { ctx.beginPath(); ctx.arc(x, y, 1 + rand() * 2, 0, Math.PI * 2); ctx.fill(); }
	}
	ctx.globalAlpha = 1;

	// title
	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = "#ffd6a5";
	ctx.font = `bold 40px ${SANS}`;
	spaced(ctx, true, 16);
	ctx.fillText("HAPPY", W / 2 + 8, 112);
	spaced(ctx, false);
	ctx.save();
	ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
	ctx.fillStyle = "#ffffff";
	fitFont(ctx, "BIRTHDAY", "bold", SERIF, 800, 118, 60);
	ctx.fillText("BIRTHDAY", W / 2, 224);
	ctx.restore();

	// rainbow arch bands, then the photo window
	const cx = 540, cy = 640, R = 225, bottom = 1000;
	const bands = ["#ffadad", "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#bdb2ff"];
	ctx.lineWidth = 16;
	ctx.lineCap = "butt";
	bands.forEach((c, i) => {
		ctx.strokeStyle = c;
		archPath(ctx, cx, cy, R + 34 + i * 22, bottom);
		ctx.stroke();
	});
	ctx.save();
	archPath(ctx, cx, cy, R, bottom);
	ctx.closePath();
	ctx.clip();
	paintAvatar(ctx, o.img, cx - R, cy - R, R * 2, bottom - (cy - R));
	ctx.restore();
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 9;
	archPath(ctx, cx, cy, R, bottom);
	ctx.closePath();
	ctx.stroke();

	// balloon clusters at the sides
	balloon(ctx, 70, 760, 46, 58, "#ff7aa8", -0.12);
	balloon(ctx, 138, 840, 40, 50, "#ffd166", 0.1);
	balloon(ctx, 1010, 760, 46, 58, "#7ad7ff", 0.12);
	balloon(ctx, 942, 840, 40, 50, "#b9f6ca", -0.1);

	// name
	ctx.save();
	ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
	ctx.fillStyle = "#ffffff";
	fitFont(ctx, name, "bold", SERIF, 860, 74, 34);
	ctx.fillText(name, W / 2, 1078);
	ctx.restore();
	lineWithStar(ctx, W / 2, 1108, 130, 24, "#ffd6a5");

	// frosted panel + wish
	ctx.fillStyle = "rgba(255,255,255,0.11)";
	roundRect(ctx, 70, 1145, W - 140, 345, 40);
	ctx.fill();
	ctx.strokeStyle = "rgba(255,255,255,0.5)";
	ctx.lineWidth = 3;
	roundRect(ctx, 70, 1145, W - 140, 345, 40);
	ctx.stroke();
	wishBox(ctx, o.wish || DEFAULT_WISH, 70, 1145, W - 140, 345, { color: "rgba(255,255,255,0.96)", size: 32, padX: 56, padY: 28 });

	footer(ctx, o.dateLine, o.timeLine, { panel: "rgba(255,255,255,0.1)", panelLine: "rgba(255,255,255,0.5)", accent: "#ffd6a5" });
}

/* ----------------------------------------------------------- 6  license */

function uniqueLicense(ctx, o, name) {
	const seedNum = hash(name);
	const rand = rng(seedNum ^ 0x2c1b3c6d);
	const g = ctx.createLinearGradient(0, 0, W * 0.5, H);
	g.addColorStop(0, "#ffe3ec"); g.addColorStop(0.5, "#ffd9b8"); g.addColorStop(1, "#fff0b8");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = "rgba(255,255,255,0.55)";
	for (let y = 30; y < H; y += 60) for (let x = (y / 60) % 2 ? 60 : 30; x < W; x += 60) { ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); }
	const cols = ["#ff6a88", "#ffb347", "#6bc5ff", "#8ee4af", "#b388eb"];
	for (let i = 0; i < 70; i++) {
		ctx.save();
		ctx.translate(rand() * W, rand() * H);
		ctx.rotate(rand() * Math.PI);
		ctx.globalAlpha = 0.6;
		ctx.fillStyle = cols[Math.floor(rand() * cols.length)];
		ctx.fillRect(-8, -3, 16, 6);
		ctx.restore();
	}

	// title
	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = "#ff6a88";
	ctx.font = `bold 34px ${SANS}`;
	spaced(ctx, true, 12);
	ctx.fillText("OFFICIALLY CERTIFIED", W / 2 + 6, 112);
	spaced(ctx, false);
	ctx.fillStyle = "#4a1942";
	fitFont(ctx, "BIRTHDAY LICENSE", "bold", SANS, 900, 104, 44);
	ctx.fillText("BIRTHDAY LICENSE", W / 2, 218);
	ctx.fillStyle = "#e0527a";
	ctx.font = `bold 32px ${SANS}`;
	spaced(ctx, true, 8);
	ctx.fillText("LICENSE TO CELEBRATE", W / 2 + 4, 272);
	spaced(ctx, false);

	// the ID card
	ctx.save();
	ctx.translate(540, 630);
	ctx.rotate(-0.035);
	softShadow(ctx, true, 36, 18, 0.3);
	const cg = ctx.createLinearGradient(-450, -280, 450, 280);
	cg.addColorStop(0, "#ff9a8b"); cg.addColorStop(1, "#ff5f8f");
	ctx.fillStyle = cg;
	roundRect(ctx, -450, -280, 900, 560, 40);
	ctx.fill();
	softShadow(ctx, false);
	ctx.strokeStyle = "rgba(255,255,255,0.9)";
	ctx.lineWidth = 6;
	roundRect(ctx, -450, -280, 900, 560, 40);
	ctx.stroke();

	// header band
	ctx.save();
	roundRect(ctx, -450, -280, 900, 560, 40);
	ctx.clip();
	ctx.fillStyle = "rgba(255,255,255,0.22)";
	ctx.fillRect(-450, -280, 900, 96);
	ctx.restore();
	ctx.fillStyle = "#ffffff";
	ctx.textAlign = "left";
	ctx.font = `bold 34px ${SANS}`;
	spaced(ctx, true, 5);
	ctx.fillText("BIRTHDAY ID", -410, -216);
	spaced(ctx, false);
	ctx.textAlign = "right";
	ctx.font = `26px ${SANS}`;
	ctx.fillText(`No. ${String(seedNum % 1000000).padStart(6, "0")}`, 410, -218);

	// photo
	ctx.save();
	roundRect(ctx, -410, -150, 300, 380, 24);
	ctx.clip();
	paintAvatar(ctx, o.img, -410, -150, 300, 380);
	ctx.restore();
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 8;
	roundRect(ctx, -410, -150, 300, 380, 24);
	ctx.stroke();

	// holographic stamp
	const hg = ctx.createLinearGradient(-170, 150, -70, 250);
	hg.addColorStop(0, "#ffd6e0"); hg.addColorStop(0.35, "#c3f0ff"); hg.addColorStop(0.7, "#e8d6ff"); hg.addColorStop(1, "#fff3b0");
	ctx.fillStyle = hg;
	ctx.beginPath(); ctx.arc(-140, 200, 54, 0, Math.PI * 2); ctx.fill();
	ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5; ctx.stroke();
	ctx.fillStyle = "#ff6a88";
	star(ctx, -140, 200, 30, 12, 5); ctx.fill();

	// fields
	const label = (t, y) => { ctx.textAlign = "left"; ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = `bold 22px ${SANS}`; spaced(ctx, true, 4); ctx.fillText(t, -80, y); spaced(ctx, false); };
	const value = (t, y, size = 40) => { ctx.textAlign = "left"; ctx.fillStyle = "#ffffff"; fitFont(ctx, t, "bold", SANS, 480, size, 24); ctx.fillText(t, -80, y); };
	label("NAME", -128);       value(name, -86, 46);
	label("ISSUED", -22);      value(o.dateLine || "Today", 20, 38);
	label("VALID UNTIL", 84);  value("Forever & ever", 126, 38);

	// barcode
	const brand = rng(seedNum);
	let bx = -80;
	ctx.fillStyle = "#ffffff";
	while (bx < 410) { const bw = 3 + Math.floor(brand() * 7); ctx.fillRect(bx, 170, bw, 66); bx += bw + 3 + Math.floor(brand() * 4); }
	ctx.fillStyle = "rgba(255,255,255,0.9)";
	ctx.font = `20px ${SANS}`;
	ctx.fillText("CAKE LEVEL: MAX", -80, 262);
	ctx.restore();

	// wish
	ctx.fillStyle = "rgba(255,255,255,0.72)";
	roundRect(ctx, 70, 960, W - 140, 520, 40);
	ctx.fill();
	ctx.strokeStyle = "#ff6a88";
	ctx.lineWidth = 4;
	roundRect(ctx, 70, 960, W - 140, 520, 40);
	ctx.stroke();
	ctx.textAlign = "center";
	ctx.fillStyle = "#e0527a";
	ctx.font = `bold 26px ${SANS}`;
	spaced(ctx, true, 6);
	ctx.fillText("A LITTLE NOTE FOR YOU", W / 2 + 3, 1020);
	spaced(ctx, false);
	wishBox(ctx, o.wish || DEFAULT_WISH, 70, 1040, W - 140, 440, { color: "#4a1942", size: 34, padX: 56, padY: 20 });

	footer(ctx, o.dateLine, o.timeLine, { panel: "rgba(74,25,66,0.9)", panelLine: "rgba(255,255,255,0.85)", accent: "#ffd166" });
}

function drawUnique(ctx, o) {
	const name = String(o.name || "Friend");
	const t = Number(o.theme);
	if (t === 4) return uniquePolaroid(ctx, o, name);
	if (t === 5) return uniqueArch(ctx, o, name);
	return uniqueLicense(ctx, o, name);
}

/* ------------------------------------------------------------------- cards */

/**
 * Paint the whole card on a W x H canvas context.
 * @param {object} o { img, bg (optional AI background image), name, wish, dateLine, timeLine, theme (1|2|3), gender (1|2|0) }
 */
function drawCard(ctx, o) {
	if (Number(o.theme) >= 4) return drawUnique(ctx, o);
	const theme = THEMES[o.theme] ? Number(o.theme) : 1;
	const t = THEMES[theme];
	const name = String(o.name || "Friend");
	const { cx, cy } = PHOTO;

	if (o.bg) aiBackground(ctx, o.bg);
	else {
		background(ctx, t);
		confetti(ctx, hash(name), t);
		if (theme === 2) decorRose(ctx, hash(name));
		else if (theme === 3) decorMidnight(ctx, hash(name));
		else decorRoyal(ctx);
	}

	title(ctx, t, theme);
	frame(ctx, theme, cx, cy);
	drawPhoto(ctx, o.img, theme, cx, cy);

	if (theme === 2) { flower(ctx, cx + 205, cy - 175, 60, "#ffffff", "#ffb74d", 8); flower(ctx, cx + 150, cy - 215, 38, "#ffc1d4", "#ffe082", 7); flower(ctx, cx - 215, cy + 120, 44, "#ffffff", "#ffb74d", 7); ribbon(ctx, o.gender === 1 ? "FOR HIM" : "FOR YOU", t); }
	else if (theme === 3) crown(ctx, cx + 175, cy - 225, 62);
	else partyHat(ctx, cx + 175, cy - 190, 0.4);

	nameBlock(ctx, name, t);
	wishBlock(ctx, o.wish || DEFAULT_WISH, t);
	footer(ctx, o.dateLine, o.timeLine, t);
}

/** "Friday", "23 October 2026", "01:05 AM" in the given time zone. */
function stamp(date = new Date(), timeZone = "Asia/Dhaka") {
	const part = (opts) => new Intl.DateTimeFormat("en-GB", Object.assign({ timeZone }, opts)).format(date);
	return {
		dateLine: part({ day: "numeric", month: "long", year: "numeric" }),
		timeLine: `${part({ weekday: "long" })}  •  ${new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hour12: true }).format(date)}`
	};
}

/** Render to a JPEG buffer with node-canvas. */
function render(Canvas, o) {
	const canvas = Canvas.createCanvas(W, H);
	drawCard(canvas.getContext("2d"), o);
	return canvas.toBuffer("image/jpeg", { quality: 0.95 });
}

module.exports = { W, H, DEFAULT_WISH, WISHES, THEMES, pickWish, drawCard, render, stamp };
