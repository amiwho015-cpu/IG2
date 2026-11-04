/**
 * Welcome card for a new member - drawn locally with node-canvas (no external API,
 * so it can no longer fail or come out blurry because of a dead server).
 *
 *   make({ api, threadID, uid, kind, threadsData }) -> { buffer, ext, file, name } | null
 *
 * kind "welcard" = purple/pink neon design, kind "welcome" = blue/teal design.
 * The member's HD profile picture is used at full size.
 */

const { createCanvas, loadImage } = require("canvas");
const { invoke } = require("./igActions");
const { profileOf, drawableName, writeTemp } = require("./cardUtil");
const { hdProfilePicture } = require("./hdpic");

const THEMES = {
	welcard: { a: "#1a0b2e", b: "#3b0f5c", c: "#12062a", accent1: "#ff3cac", accent2: "#784ba0", accent3: "#2b86c5", chip: "#ff3cac" },
	welcome: { a: "#04172b", b: "#06476b", c: "#021226", accent1: "#00e5ff", accent2: "#2979ff", accent3: "#00c6a7", chip: "#00c6ff" }
};
const FONT = '"Poppins", "Arial", "DejaVu Sans", sans-serif';

function rr(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

/** Largest font size (<= max) at which `text` fits in `width`. */
function fitFont(ctx, text, weight, max, min, width) {
	let size = max;
	while (size > min) {
		ctx.font = `${weight} ${size}px ${FONT}`;
		if (ctx.measureText(text).width <= width) break;
		size -= 2;
	}
	ctx.font = `${weight} ${size}px ${FONT}`;
	return size;
}

/**
 * Makes the welcome text drawable: styled "math italic" letters become plain letters,
 * emoji and non-Latin symbols (no glyphs in the card font) are dropped, brackets are swapped.
 */
function cleanText(text) {
	return String(text || "")
		.normalize("NFKC")
		.replace(/[『「【〔]/g, "«").replace(/[』」】〕]/g, "»")
		.replace(/\p{Extended_Pictographic}|[\uFE0F\u200D]/gu, "")
		.replace(/[^\p{Script=Latin}\p{N}\p{P}\p{Zs}\n]/gu, "")
		.split("\n").map(l => l.replace(/\s+/g, " ").trim()).join("\n")
		.replace(/\n{3,}/g, "\n\n").trim();
}

/** Pure drawing: ctx is a 1600x700 canvas context, avatar is an image or null. */
function drawCard(ctx, W, H, { avatar, name, group, count, kind, text }) {
	const t = THEMES[kind] || THEMES.welcard;
	ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";

	// background gradient
	const bg = ctx.createLinearGradient(0, 0, W, H);
	bg.addColorStop(0, t.a); bg.addColorStop(0.55, t.b); bg.addColorStop(1, t.c);
	ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

	// soft blurred copy of the picture as a backdrop (tiny -> stretched = blur)
	if (avatar) {
		const tiny = createCanvas(24, 24);
		tiny.getContext("2d").drawImage(avatar, 0, 0, 24, 24);
		ctx.save(); ctx.globalAlpha = 0.35;
		ctx.drawImage(tiny, 0, 0, W, H);
		ctx.restore();
	}
	ctx.fillStyle = "rgba(5,3,15,0.45)"; ctx.fillRect(0, 0, W, H);

	// glow blobs
	const blob = (x, y, r, color) => {
		const g = ctx.createRadialGradient(x, y, 0, x, y, r);
		g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
	};
	blob(380, 350, 520, t.accent2 + "66");
	blob(1450, 80, 380, t.accent1 + "40");
	blob(1300, 650, 360, t.accent3 + "40");

	// bokeh dots (fixed pattern)
	const dots = [[120,90,10],[260,610,7],[610,60,6],[690,640,12],[980,45,8],[1530,330,9],[1110,665,6],[40,400,8],[560,330,5],[1380,520,7]];
	ctx.fillStyle = "rgba(255,255,255,0.35)";
	for (const [x, y, r] of dots) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

	// glass panel
	const px = 700, py = 90, pw = 820, ph = H - 180;
	ctx.save();
	ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
	ctx.fillStyle = "rgba(255,255,255,0.10)"; rr(ctx, px, py, pw, ph, 44); ctx.fill();
	ctx.restore();
	ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 2; rr(ctx, px, py, pw, ph, 44); ctx.stroke();

	// avatar with gradient ring + glow
	const cx = 380, cy = H / 2, r = 200;
	ctx.save();
	ctx.shadowColor = t.accent1; ctx.shadowBlur = 60;
	const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
	ring.addColorStop(0, t.accent1); ring.addColorStop(0.5, t.accent2); ring.addColorStop(1, t.accent3);
	ctx.fillStyle = ring; ctx.beginPath(); ctx.arc(cx, cy, r + 16, 0, Math.PI * 2); ctx.fill();
	ctx.restore();
	ctx.fillStyle = "#0b0716"; ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.fill();
	ctx.save();
	ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
	if (avatar) {
		const side = Math.min(avatar.width, avatar.height);
		ctx.drawImage(avatar, (avatar.width - side) / 2, (avatar.height - side) / 2, side, side, cx - r, cy - r, r * 2, r * 2);
	}
	else {
		ctx.fillStyle = ring; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
		ctx.fillStyle = "#fff"; ctx.font = `bold 190px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
		ctx.fillText(String(name || "?").charAt(0).toUpperCase(), cx, cy + 10);
	}
	ctx.restore();

	if (text) {
		// Whole welcome message inside the picture: no separate text message needed.
		const lx = px + 56, lw = pw - 112;
		const lines = cleanText(text).split("\n");
		const gap = 40, blank = 22;
		const total = lines.reduce((h, l) => h + (l ? gap : blank), 0);
		let y = py + (ph - total) / 2 + 30;
		ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
		lines.forEach((line, i) => {
			if (!line) { y += blank; return; }
			const first = i === 0;
			ctx.save();
			if (first) { ctx.shadowColor = t.accent1 + "99"; ctx.shadowBlur = 18; }
			ctx.fillStyle = first ? "#ffffff" : "rgba(255,255,255,0.88)";
			fitFont(ctx, line, first ? "700" : "italic 500", first ? 36 : 29, 18, lw);
			ctx.fillText(line, lx, y);
			ctx.restore();
			y += gap;
		});
		return;
	}

	// text
	const tx = px + 60, tw = pw - 120;
	ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
	ctx.fillStyle = t.chip; ctx.font = `600 30px ${FONT}`;
	ctx.fillText("N E W   M E M B E R", tx, py + 95);

	const wg = ctx.createLinearGradient(tx, 0, tx + 520, 0);
	wg.addColorStop(0, "#ffffff"); wg.addColorStop(1, t.accent1);
	ctx.save(); ctx.shadowColor = t.accent1 + "99"; ctx.shadowBlur = 24;
	ctx.fillStyle = wg; ctx.font = `800 118px ${FONT}`;
	ctx.fillText("WELCOME", tx, py + 215);
	ctx.restore();

	ctx.fillStyle = "#ffffff";
	fitFont(ctx, name, "700", 66, 30, tw);
	ctx.fillText(name, tx, py + 305);

	ctx.fillStyle = "rgba(255,255,255,0.78)";
	fitFont(ctx, `to ${group}`, "500", 40, 24, tw);
	ctx.fillText(`to ${group}`, tx, py + 365);

	// member chip + divider
	ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 2;
	ctx.beginPath(); ctx.moveTo(tx, py + 405); ctx.lineTo(tx + tw, py + 405); ctx.stroke();
	const label = count != null && count !== "" ? `You are member #${count}` : "Glad to have you here";
	ctx.font = `600 30px ${FONT}`;
	const cw = ctx.measureText(label).width + 56;
	const chipGrad = ctx.createLinearGradient(tx, 0, tx + cw, 0);
	chipGrad.addColorStop(0, t.accent1); chipGrad.addColorStop(1, t.accent2);
	ctx.fillStyle = chipGrad; rr(ctx, tx, py + 430, cw, 58, 29); ctx.fill();
	ctx.fillStyle = "#fff"; ctx.fillText(label, tx + 28, py + 470);
}

async function groupFacts(api, threadID, threadsData) {
	let name = null, count = null;
	try {
		const rec = threadsData && threadsData.get ? threadsData.get(threadID) : null;
		name = rec && rec.name;
	}
	catch (_) { /* optional */ }
	try {
		const info = await invoke(api, "getThreadInfo", [String(threadID)]);
		if (info) {
			name = info.name || info.threadName || name;
			const list = info.participantIDs || info.userIDs;
			if (Array.isArray(list)) count = list.length;
		}
	}
	catch (_) { /* optional */ }
	const clean = String(name || "").replace(/[^\p{Script=Latin}\p{N}\s.'_&-]/gu, "").replace(/\s+/g, " ").trim();
	return { name: clean.length >= 2 ? clean.slice(0, 30) : "our group", count };
}

function make(opts) {
	const limit = (opts.timeout || 25000) + 8000;
	return Promise.race([
		makeCard(opts),
		new Promise(resolve => setTimeout(() => resolve(null), limit).unref())
	]);
}

async function makeCard({ api, threadID, uid, kind = "welcard", threadsData, username, text }) {
	if (!uid) return null;
	try {
		const profile = await profileOf(api, uid);
		const plain = profile && (profile.profilePicture || profile.thumbSrc || profile.profilePicUrl);
		const [pic, group] = await Promise.all([
			hdProfilePicture(String(uid), [plain]).catch(() => null),
			groupFacts(api, threadID, threadsData)
		]);
		let avatar = null;
		try { if (pic && pic.buffer) avatar = await loadImage(pic.buffer); } catch (_) { /* initial letter below */ }
		// Show the @username (what people know the account by); fall back to the display name.
		const handle = String(username || (profile && (profile.vanity || profile.username)) || "").replace(/^@/, "").replace(/[^\w.]/g, "");
		const name = handle ? "@" + handle : drawableName(profile, uid);

		const W = 1600, H = text ? 820 : 700;
		const canvas = createCanvas(W, H);
		drawCard(canvas.getContext("2d"), W, H, { avatar, name, group: group.name, count: group.count, kind: THEMES[kind] ? kind : "welcard", text });
		const buffer = canvas.toBuffer("image/jpeg", { quality: 0.95 });
		return { buffer, ext: "jpg", file: writeTemp(buffer, "jpg", "welcome"), name };
	}
	catch (error) {
		require("./logger").warn("WELCOME", `card failed: ${error.message}`);
		return null;
	}
}

module.exports = { make, groupFacts, drawCard, cleanText, THEMES };
