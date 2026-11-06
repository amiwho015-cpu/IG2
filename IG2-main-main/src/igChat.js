"use strict";

/**
 * Instagram DM look-alike screenshot (dark or light), drawn with plain canvas calls.
 * Modelled on a real phone screenshot: status bar, header with a story-ring avatar,
 * grey received bubbles, purple sent bubbles, reaction pills, "YESTERDAY 9:05 PM" labels
 * and the message bar with its icons. Author: Shihab
 *
 *   render(Canvas, {
 *     name, username, avatar, theme, timeText, battery, speed, ring, seen,
 *     items: [ { kind: "msg", side: "l" | "r", text, reaction }, { kind: "date", text } ]
 *   })
 */

const W = 1080;
const MIN_H = 2400;
const FONT = "DejaVu Sans, Noto Sans Bengali, Arial, sans-serif";

const THEMES = {
	dark: { bg: "#000000", text: "#ffffff", sub: "#a8a8a8", line: "#3a3a3a", bubble: "#262626", pill: "#262626", icon: "#ffffff", battery: "#ffffff", batteryText: "#101010" },
	light: { bg: "#ffffff", text: "#000000", sub: "#737373", line: "#dbdbdb", bubble: "#efefef", pill: "#efefef", icon: "#000000", battery: "#101010", batteryText: "#ffffff" }
};

const EMOJI_RE = /[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu;
const TRAILING_EMOJI_RE = /([\p{Extended_Pictographic}\uFE0F\u200D\u20E3\s]+)$/u;

// the emoji we can draw ourselves (the host usually has no emoji font)
const EMOJI_NAMES = {
	"😂": "laugh", "🤣": "laugh", "😀": "smile", "😃": "smile", "😄": "smile", "😁": "smile", "😊": "smile", "🙂": "smile",
	"😍": "love", "🥰": "love", "😭": "cry", "😢": "cry", "🥲": "cry", "😥": "cry", "😮": "wow", "😲": "wow", "😯": "wow",
	"😡": "angry", "😠": "angry", "😐": "neutral", "😑": "neutral", "😒": "unamused", "😏": "unamused", "🙄": "unamused", "❤": "heart", "♥": "heart", "💖": "heart", "💕": "heart", "👍": "like"
};
const REACTION_WORDS = {
	haha: "laugh", laugh: "laugh", lol: "laugh", love: "heart", heart: "heart", like: "like", wow: "wow", neutral: "neutral", sad: "cry", cry: "cry", angry: "angry", smile: "smile"
};

/** "😂" / "haha" / "❤️" -> "laugh" / "laugh" / "heart", or null when we cannot draw it. */
function emojiName(token) {
	const t = String(token || "").replace(/[\uFE0F\u200D]/g, "").trim();
	return REACTION_WORDS[t.toLowerCase()] || EMOJI_NAMES[t] || null;
}

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

function heartPath(ctx, cx, cy, s) {
	ctx.beginPath();
	ctx.moveTo(cx, cy + s * 0.9);
	ctx.bezierCurveTo(cx - s * 1.4, cy - s * 0.1, cx - s * 0.7, cy - s * 1.1, cx, cy - s * 0.35);
	ctx.bezierCurveTo(cx + s * 0.7, cy - s * 1.1, cx + s * 1.4, cy - s * 0.1, cx, cy + s * 0.9);
	ctx.closePath();
}

/** Small emoji faces drawn with shapes. */
function drawEmoji(ctx, name, cx, cy, r) {
	ctx.save();
	ctx.lineCap = "round";
	const ink = "#5b2a12";
	const face = (top, bottom) => {
		const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
		g.addColorStop(0, top); g.addColorStop(1, bottom);
		ctx.fillStyle = g;
		ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
	};
	const eyes = (dy = -0.15, rad = 0.1) => {
		ctx.fillStyle = ink;
		for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sx * r * 0.34, cy + r * dy, r * rad, 0, Math.PI * 2); ctx.fill(); }
	};
	const happyEyes = () => {
		ctx.strokeStyle = ink; ctx.lineWidth = r * 0.13;
		for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sx * r * 0.38, cy - r * 0.05, r * 0.2, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke(); }
	};

	if (name === "heart") {
		ctx.fillStyle = "#ff3040";
		heartPath(ctx, cx, cy - r * 0.05, r * 0.85);
		ctx.fill();
	}
	else if (name === "like") {
		ctx.fillStyle = "#4a90e2";
		roundRect(ctx, cx - r * 0.95, cy - r * 0.05, r * 0.42, r * 0.95, r * 0.08); ctx.fill();
		ctx.fillStyle = "#ffd84d";
		roundRect(ctx, cx - r * 0.45, cy - r * 0.15, r * 1.4, r * 1.05, r * 0.25); ctx.fill();
		roundRect(ctx, cx - r * 0.25, cy - r * 0.95, r * 0.48, r * 1.0, r * 0.24); ctx.fill();
	}
	else if (name === "angry") {
		face("#ff8a65", "#d84315");
		eyes(0.02, 0.1);
		ctx.strokeStyle = ink; ctx.lineWidth = r * 0.13;
		ctx.beginPath(); ctx.moveTo(cx - r * 0.6, cy - r * 0.38); ctx.lineTo(cx - r * 0.12, cy - r * 0.15); ctx.moveTo(cx + r * 0.6, cy - r * 0.38); ctx.lineTo(cx + r * 0.12, cy - r * 0.15); ctx.stroke();
		ctx.beginPath(); ctx.arc(cx, cy + r * 0.72, r * 0.34, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
	}
	else {
		face("#ffe27a", "#f4a62a");
		if (name === "laugh") {
			happyEyes();
			ctx.fillStyle = ink;
			ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.22, r * 0.56, r * 0.46, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
			ctx.fillStyle = "#ffffff";
			ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.1, r * 0.46, r * 0.12, 0, 0, Math.PI); ctx.fill();
			ctx.fillStyle = "#4fc3f7";
			for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sx * r * 0.92, cy + r * 0.02, r * 0.14, 0, Math.PI * 2); ctx.fill(); }
		}
		else if (name === "love") {
			ctx.fillStyle = "#ff3040";
			for (const sx of [-1, 1]) { heartPath(ctx, cx + sx * r * 0.36, cy - r * 0.15, r * 0.22); ctx.fill(); }
			ctx.strokeStyle = ink; ctx.lineWidth = r * 0.1;
			ctx.beginPath(); ctx.arc(cx, cy + r * 0.05, r * 0.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
		}
		else if (name === "cry") {
			happyEyes();
			ctx.strokeStyle = ink; ctx.lineWidth = r * 0.1;
			ctx.beginPath(); ctx.arc(cx, cy + r * 0.72, r * 0.34, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
			ctx.fillStyle = "#4fc3f7";
			for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + sx * r * 0.4, cy + r * 0.32, r * 0.1, r * 0.26, 0, 0, Math.PI * 2); ctx.fill(); }
		}
		else if (name === "neutral") {
			eyes();
			ctx.strokeStyle = ink; ctx.lineWidth = r * 0.11;
			ctx.beginPath(); ctx.moveTo(cx - r * 0.38, cy + r * 0.45); ctx.lineTo(cx + r * 0.38, cy + r * 0.45); ctx.stroke();
		}
		else if (name === "unamused") {
			eyes(-0.05, 0.1);
			ctx.strokeStyle = ink; ctx.lineWidth = r * 0.11;
			ctx.beginPath(); ctx.moveTo(cx - r * 0.55, cy - r * 0.3); ctx.lineTo(cx - r * 0.12, cy - r * 0.3); ctx.moveTo(cx + r * 0.12, cy - r * 0.3); ctx.lineTo(cx + r * 0.55, cy - r * 0.3); ctx.stroke();
			ctx.beginPath(); ctx.arc(cx, cy + r * 0.78, r * 0.34, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
		}
		else if (name === "wow") {
			eyes();
			ctx.fillStyle = ink;
			ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.42, r * 0.17, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
		}
		else {
			eyes();
			ctx.strokeStyle = ink; ctx.lineWidth = r * 0.1;
			ctx.beginPath(); ctx.arc(cx, cy + r * 0.05, r * 0.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
		}
	}
	ctx.restore();
}

function wrap(ctx, text, maxWidth) {
	const lines = [];
	for (const paragraph of String(text).split("\n")) {
		let line = "";
		for (const word of paragraph.split(/\s+/).filter(Boolean)) {
			let test = line ? line + " " + word : word;
			if (ctx.measureText(test).width <= maxWidth || !line) {
				// a single very long word is cut so it can never run out of the bubble
				while (ctx.measureText(test).width > maxWidth && test.length > 1) {
					let cut = test.length - 1;
					while (cut > 1 && ctx.measureText(test.slice(0, cut)).width > maxWidth) cut--;
					lines.push(test.slice(0, cut));
					test = test.slice(cut);
				}
				line = test;
			}
			else { lines.push(line); line = word; }
		}
		lines.push(line);
	}
	return lines.length ? lines : [""];
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

const clean = s => String(s || "").replace(EMOJI_RE, "").replace(/\s+/g, " ").trim();

function ellipsize(ctx, text, maxWidth) {
	if (ctx.measureText(text).width <= maxWidth) return text;
	let t = text;
	while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
	return t + "…";
}

/* ----------------------------------------------------------------- layout */

const FONT_PX = 39, LINE_H = 49, PAD_X = 34, PAD_Y = 28, MAX_TEXT = 640;
const TOP = 272;
const INTRO_H = 832;     // the big profile block at the start of a new chat

/** Sizes and lines for every item, so the canvas height is known before anything is drawn. */
function layout(ctx, rawItems) {
	ctx.font = `${FONT_PX}px ${FONT}`;
	const gap = FONT_PX + 6;
	return rawItems.map(m => {
		if (m.kind === "date") return { kind: "date", text: String(m.text || "").toUpperCase().slice(0, 40), h: 34 };
		if (m.kind === "divider") return { kind: "divider", text: String(m.text || "New messages").slice(0, 30), h: 40 };

		let text = String(m.text || "");
		let emojis = [];
		const tail = text.match(TRAILING_EMOJI_RE);
		if (tail && tail[1].replace(/\s/g, "")) {
			emojis = Array.from(tail[1]).map(emojiName).filter(Boolean).slice(0, 4);
			text = text.slice(0, tail.index);
		}
		text = clean(text);
		const lines = wrap(ctx, text, MAX_TEXT);
		let lastW = text ? ctx.measureText(lines[lines.length - 1]).width : 0;
		const emojiW = emojis.length * gap;
		if (emojis.length && lastW + (lastW ? 8 : 0) + emojiW > MAX_TEXT && lines[lines.length - 1]) { lines.push(""); lastW = 0; }
		const widest = Math.max(...lines.map(l => ctx.measureText(l).width), lastW + (lastW ? 8 : 0) + emojiW);
		return {
			kind: "msg", side: m.side, lines, emojis, lastW, reaction: emojiName(m.reaction), edited: !!m.edited,
			w: Math.max(120, Math.ceil(widest) + PAD_X * 2), h: lines.length * LINE_H + PAD_Y * 2
		};
	});
}

function gapBefore(prev, it) {
	const extra = it.kind === "msg" && it.edited ? 46 : 0;     // room for the blue "Edited" label
	if (!prev) return (it.kind === "date" ? 20 : 0) + extra;
	if (it.kind === "date") return 64;
	if (it.kind === "divider") return 58;
	if (prev.kind === "date" || prev.kind === "divider") return 40 + extra;
	if (prev.side === it.side) return (prev.reaction ? 46 : 8) + extra;
	return (prev.reaction ? 62 : 38) + extra;
}

function heightFor(items, intro) {
	let y = TOP + (intro ? INTRO_H : 0);
	items.forEach((it, i) => { y += gapBefore(items[i - 1], it) + it.h; });
	return Math.max(MIN_H, y + 120 + 190);
}

/* ---------------------------------------------------------------- pieces */

function statusBar(ctx, t, o) {
	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "left";
	ctx.fillStyle = t.text;
	ctx.font = `bold 30px ${FONT}`;
	const time = o.timeText || "9:41";
	ctx.fillText(time, 47, 62);
	const tw = ctx.measureText(time).width;
	ctx.beginPath(); ctx.arc(47 + tw + 16, 50, 10, 0, Math.PI * 2); ctx.fill();      // the notification dot follows the clock

	ctx.font = `19px ${FONT}`;
	ctx.fillText(String(o.speed || "0.5"), 697, 50);
	ctx.fillText("KB/s", 697, 71);

	ctx.strokeStyle = t.text; ctx.lineWidth = 4; ctx.lineCap = "round";
	for (const r of [9, 18, 27]) { ctx.beginPath(); ctx.arc(774, 74, r, 1.25 * Math.PI, 1.75 * Math.PI); ctx.stroke(); }
	ctx.beginPath(); ctx.moveTo(766, 80); ctx.lineTo(782, 80); ctx.stroke();

	ctx.font = `bold 15px ${FONT}`;
	ctx.fillText("VoD", 818, 50);
	ctx.fillText("LTE", 818, 70);

	for (const base of [876, 940]) {
		for (let i = 0; i < 4; i++) { ctx.fillStyle = i < 3 ? t.text : t.sub; ctx.fillRect(base + i * 10, 68 - i * 7 - 6, 6, 12 + i * 7); }
	}

	const level = Math.max(1, Math.min(100, Math.round(o.battery == null ? 98 : o.battery)));
	ctx.fillStyle = t.battery;
	roundRect(ctx, 985, 46, 56, 32, 10); ctx.fill();
	ctx.fillRect(1042, 55, 4, 14);
	ctx.fillStyle = t.batteryText;
	ctx.font = `bold 23px ${FONT}`;
	ctx.textAlign = "center";
	ctx.fillText(String(level), 1013, 70);
	ctx.textAlign = "left";
}

function drawHeader(ctx, t, o) {
	const cy = 178;

	// back arrow
	ctx.strokeStyle = t.icon; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
	ctx.beginPath(); ctx.moveTo(104, cy); ctx.lineTo(50, cy); ctx.moveTo(80, cy - 27); ctx.lineTo(50, cy); ctx.lineTo(80, cy + 27); ctx.stroke();

	// avatar, with the story ring when there is one
	const ax = 243;
	if (o.ring !== false) {
		const g = ctx.createLinearGradient(ax - 52, cy + 52, ax + 52, cy - 52);
		g.addColorStop(0, "#feda75"); g.addColorStop(0.35, "#fa7e1e"); g.addColorStop(0.65, "#d62976"); g.addColorStop(1, "#962fbf");
		ctx.fillStyle = g;
		ctx.beginPath(); ctx.arc(ax, cy, 52, 0, Math.PI * 2); ctx.fill();
		ctx.fillStyle = t.bg;
		ctx.beginPath(); ctx.arc(ax, cy, 48, 0, Math.PI * 2); ctx.fill();
		avatarCircle(ctx, o.avatar, ax, cy, 44);
	}
	else avatarCircle(ctx, o.avatar, ax, cy, 40);

	// name and username (cut with "…" like the app does)
	ctx.textAlign = "left";
	ctx.fillStyle = t.text;
	ctx.font = `bold 34px ${FONT}`;
	ctx.fillText(ellipsize(ctx, clean(o.name) || "Instagram User", 330), 327, 172);
	ctx.fillStyle = t.sub;
	ctx.font = `30px ${FONT}`;
	ctx.fillText(ellipsize(ctx, clean(o.username), 330), 327, 214);

	ctx.strokeStyle = t.icon; ctx.lineWidth = 5; ctx.fillStyle = t.icon;
	// avatar-add: a face in a circle with a small plus
	ctx.beginPath(); ctx.arc(718, cy - 2, 27, 0, Math.PI * 2); ctx.stroke();
	ctx.beginPath(); ctx.arc(718, cy - 6, 13, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
	ctx.fillStyle = t.bg;
	ctx.beginPath(); ctx.arc(744, cy + 22, 14, 0, Math.PI * 2); ctx.fill();
	ctx.fillStyle = t.icon;
	ctx.beginPath(); ctx.moveTo(744, cy + 14); ctx.lineTo(744, cy + 30); ctx.moveTo(736, cy + 22); ctx.lineTo(752, cy + 22); ctx.stroke();

	// call: a handset (curved bar with two ends)
	ctx.lineWidth = 6;
	ctx.beginPath(); ctx.arc(868, cy - 14, 32, 0.5 * Math.PI, Math.PI); ctx.stroke();
	ctx.beginPath(); ctx.arc(836, cy - 14, 7, 0, Math.PI * 2); ctx.fill();
	ctx.beginPath(); ctx.arc(868, cy + 18, 7, 0, Math.PI * 2); ctx.fill();

	// flag
	ctx.lineWidth = 5;
	ctx.beginPath(); ctx.moveTo(972, cy - 34); ctx.lineTo(972, cy + 36); ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(972, cy - 32); ctx.bezierCurveTo(990, cy - 42, 1002, cy - 22, 1020, cy - 32);
	ctx.lineTo(1020, cy + 6); ctx.bezierCurveTo(1002, cy + 16, 990, cy - 6, 972, cy + 4);
	ctx.stroke();
}

/** The big profile block a brand-new chat starts with. */
function drawIntro(ctx, t, o) {
	avatarCircle(ctx, o.avatar, 540, 494, 158);
	ctx.textAlign = "center";
	ctx.fillStyle = t.text;
	const name = clean(o.name);
	if (name && name !== clean(o.username)) { ctx.font = `bold 38px ${FONT}`; ctx.fillText(ellipsize(ctx, name, 800), 540, 764); }
	ctx.font = `38px ${FONT}`;
	ctx.fillText(ellipsize(ctx, clean(o.username), 800), 540, 818);
	ctx.fillStyle = t.bubble;
	roundRect(ctx, 400, 866, 280, 92, 16); ctx.fill();
	ctx.fillStyle = t.text;
	ctx.font = `35px ${FONT}`;
	ctx.fillText("View profile", 540, 925);
}

function drawFooter(ctx, t, height) {
	const h = 143, top = height - 22 - h, cy = top + h / 2;
	ctx.fillStyle = t.bg;
	ctx.fillRect(0, top - 24, W, h + 24 + 22);
	ctx.fillStyle = t.pill;
	roundRect(ctx, 22, top, W - 44, h, h / 2);
	ctx.fill();

	// camera
	ctx.fillStyle = "#4b63f7";
	ctx.beginPath(); ctx.arc(93, cy, 54, 0, Math.PI * 2); ctx.fill();
	ctx.fillStyle = "#ffffff";
	roundRect(ctx, 93 - 26, cy - 15, 52, 38, 8); ctx.fill();
	ctx.fillRect(93 - 12, cy - 22, 24, 10);
	ctx.fillStyle = "#4b63f7";
	ctx.beginPath(); ctx.arc(93, cy + 4, 11, 0, Math.PI * 2); ctx.fill();

	ctx.textAlign = "left";
	ctx.fillStyle = t.sub;
	ctx.font = `40px ${FONT}`;
	ctx.fillText("Message...", 170, cy + 14);

	ctx.strokeStyle = t.icon; ctx.fillStyle = t.icon; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
	// music note with a plus
	ctx.beginPath(); ctx.arc(504, cy + 20, 11, 0, Math.PI * 2); ctx.stroke();
	ctx.beginPath(); ctx.arc(536, cy + 12, 11, 0, Math.PI * 2); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(515, cy + 20); ctx.lineTo(515, cy - 20); ctx.lineTo(547, cy - 28); ctx.lineTo(547, cy + 12); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(556, cy - 44); ctx.lineTo(556, cy - 24); ctx.moveTo(546, cy - 34); ctx.lineTo(566, cy - 34); ctx.stroke();
	// mic
	roundRect(ctx, 632, cy - 36, 24, 46, 12); ctx.stroke();
	ctx.beginPath(); ctx.arc(644, cy - 4, 24, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(644, cy + 20); ctx.lineTo(644, cy + 34); ctx.stroke();
	// image
	roundRect(ctx, 730, cy - 30, 52, 52, 10); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(734, cy + 14); ctx.lineTo(752, cy - 6); ctx.lineTo(764, cy + 6); ctx.lineTo(774, cy - 2); ctx.stroke();
	ctx.beginPath(); ctx.arc(768, cy - 16, 4, 0, Math.PI * 2); ctx.fill();
	// sticker bubble
	roundRect(ctx, 842, cy - 32, 54, 48, 14); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(856, cy + 16); ctx.lineTo(850, cy + 32); ctx.lineTo(870, cy + 16); ctx.stroke();
	ctx.beginPath(); ctx.arc(869, cy - 10, 12, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
	// plus in a circle
	ctx.beginPath(); ctx.arc(981, cy, 28, 0, Math.PI * 2); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(981, cy - 14); ctx.lineTo(981, cy + 14); ctx.moveTo(967, cy); ctx.lineTo(995, cy); ctx.stroke();
}

function drawCard(ctx, o, height, items) {
	const t = THEMES[o.theme] || THEMES.dark;
	ctx.fillStyle = t.bg;
	ctx.fillRect(0, 0, W, height);

	const footerTop = height - 22 - 143;
	const grad = ctx.createLinearGradient(0, TOP, 0, footerTop);
	grad.addColorStop(0, "#8c4bf5"); grad.addColorStop(1, "#5e5bf6");

	if (o.intro) drawIntro(ctx, t, o);

	let y = TOP + (o.intro ? INTRO_H : 0);
	let lastRightBottom = null, lastRightHasReaction = false;
	items.forEach((it, i) => {
		const prev = items[i - 1], next = items[i + 1];
		y += gapBefore(prev, it);

		if (it.kind === "date") {
			ctx.fillStyle = t.sub;
			ctx.font = `31px ${FONT}`;
			ctx.textAlign = "center";
			ctx.fillText(it.text, W / 2, y + 28);
			y += it.h;
			return;
		}
		if (it.kind === "divider") {
			ctx.strokeStyle = t.line; ctx.lineWidth = 2;
			ctx.beginPath(); ctx.moveTo(68, y + 20); ctx.lineTo(382, y + 20); ctx.moveTo(696, y + 20); ctx.lineTo(1012, y + 20); ctx.stroke();
			ctx.fillStyle = t.sub;
			ctx.font = `31px ${FONT}`;
			ctx.textAlign = "center";
			ctx.fillText(it.text, W / 2, y + 30);
			y += it.h;
			return;
		}

		const x = it.side === "r" ? W - 36 - it.w : 160;
		if (it.edited) {
			ctx.fillStyle = "#5b6cf0";
			ctx.font = `28px ${FONT}`;
			ctx.textAlign = it.side === "r" ? "right" : "left";
			ctx.fillText("Edited", it.side === "r" ? W - 44 : 180, y - 16);
		}
		const radius = it.lines.length > 1 ? 44 : it.h / 2;
		ctx.fillStyle = it.side === "r" ? grad : t.bubble;
		roundRect(ctx, x, y, it.w, it.h, radius);
		ctx.fill();

		ctx.fillStyle = it.side === "r" ? "#ffffff" : t.text;
		ctx.font = `${FONT_PX}px ${FONT}`;
		ctx.textAlign = "left";
		it.lines.forEach((line, k) => ctx.fillText(line, x + PAD_X, y + PAD_Y + 36 + k * LINE_H));
		if (it.emojis.length) {
			const base = y + PAD_Y + 36 + (it.lines.length - 1) * LINE_H;
			let ex = x + PAD_X + it.lastW + (it.lastW ? 8 : 0) + (FONT_PX + 6) / 2;
			for (const name of it.emojis) { drawEmoji(ctx, name, ex - 3, base - 14, 20); ex += FONT_PX + 6; }
		}

		if (it.reaction) {
			const pw = 84, ph = 58;
			const px = it.side === "l" ? x + 26 : x + it.w - 26 - pw, py = y + it.h - 10;
			ctx.fillStyle = t.bubble;
			roundRect(ctx, px, py, pw, ph, ph / 2); ctx.fill();
			ctx.strokeStyle = t.bg; ctx.lineWidth = 5;
			roundRect(ctx, px, py, pw, ph, ph / 2); ctx.stroke();
			drawEmoji(ctx, it.reaction, px + pw / 2, py + ph / 2, 19);
		}

		// the avatar sits beside the last bubble of a run of received messages
		if (it.side === "l" && (!next || next.kind !== "msg" || next.side !== "l")) avatarCircle(ctx, o.avatar, 92, y + it.h - 40, 40);
		if (it.side === "r") { lastRightBottom = y + it.h; lastRightHasReaction = !!it.reaction; }
		y += it.h;
	});

	const last = items[items.length - 1];
	if (o.seen !== false && last && last.kind === "msg" && last.side === "r" && lastRightBottom != null) {
		ctx.fillStyle = t.sub;
		ctx.font = `28px ${FONT}`;
		ctx.textAlign = "right";
		ctx.fillText("Seen", W - 40, lastRightBottom + (lastRightHasReaction ? 90 : 44));
	}

	ctx.fillStyle = t.bg;
	ctx.fillRect(0, 0, W, 252);
	statusBar(ctx, t, o);
	drawHeader(ctx, t, o);
	drawFooter(ctx, t, height);
}

function render(Canvas, o) {
	const probe = Canvas.createCanvas(W, 100).getContext("2d");
	const items = layout(probe, o.items);
	const height = heightFor(items, o.intro);
	const canvas = Canvas.createCanvas(W, height);
	drawCard(canvas.getContext("2d"), o, height, items);
	return canvas.toBuffer("image/jpeg", { quality: 0.95 });
}

module.exports = { W, THEMES, layout, heightFor, drawCard, render, emojiName };
