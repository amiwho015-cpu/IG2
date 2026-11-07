"use strict";

/** Shared helpers for the group card images (gcimg, couplegc). */

const axios = require("axios");
const { loadImage } = require("canvas");

const MAX_MEMBERS = 300; // cards stay readable and the canvas stays small enough

function roundRect(ctx, x, y, w, h, r) {
	if (w < 2 * r) r = w / 2;
	if (h < 2 * r) r = h / 2;
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
	return ctx;
}

async function fetchImage(url) {
	if (!url) return null;
	try {
		try {
			const hd = await require("./hdpic").bestPicture([url]); // sharpest variant of this picture
			if (hd && hd.buffer) return await loadImage(hd.buffer);
		}
		catch (_) { /* plain download below */ }
		const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000, headers: { "User-Agent": "Mozilla/5.0" } });
		return await loadImage(Buffer.from(res.data));
	}
	catch (_) { return null; }
}

const chunk = (list, n) => { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };

/** Profile pictures + display names for the given ids. Works for big groups (batched). */
async function loadAvatars(api, ids) {
	const unique = [...new Set(ids.map(String))];
	const urls = {};
	const names = {};
	for (const part of chunk(unique, 40)) {
		try {
			const info = await api.getUserInfo(part);
			for (const id of part) {
				const u = (info && info[id]) || {};
				urls[id] = u.profilePicture || u.profilePicUrl || u.thumbSrc || "";
				names[id] = u.name || u.fullName || u.userName || u.username || "";
			}
		}
		catch (_) { /* placeholders below */ }
	}
	const images = {};
	for (const part of chunk(unique, 20)) await Promise.all(part.map(async id => {
		// HD picture from Instagram's private endpoint (cached); the thumbnail from
		// getUserInfo is only ~150px and looks blurry on the big card.
		try {
			const hd = await require("./hdpic").hdProfilePicture(id, [urls[id]]);
			if (hd && hd.buffer) { images[id] = await loadImage(hd.buffer); return; }
		}
		catch (_) { /* thumbnail below */ }
		images[id] = await fetchImage(urls[id]);
	}));
	return { images, names };
}

function drawFallback(ctx, x, y, size) {
	ctx.fillStyle = "#444";
	ctx.fillRect(x, y, size, size);
	ctx.fillStyle = "#ddd";
	ctx.font = `bold ${Math.floor(size / 2)}px Arial`;
	ctx.textAlign = "center";
	ctx.fillText("?", x + size / 2, y + size * 0.68);
}

async function getGroup(api, threadID) {
	const info = await api.getThreadInfo(threadID);
	const everyone = (info.participantIDs || info.userIDs || []).map(String);
	const adminIDs = (info.adminIDs || []).map(a => String(a && a.id != null ? a.id : a));
	return { info, name: info.threadName || info.name || "Unnamed Group", everyone, adminIDs };
}

function shortName(name, max = 12) {
	const n = String(name || "").trim();
	return n.length > max ? n.slice(0, max - 1) + "…" : n;
}

/**
 * Draw every id as a round avatar card in a centered grid.
 * Returns the y position just below the last row.
 */
function drawMemberGrid(ctx, ids, avatars, opts) {
	const { x0, y0, perRow, size, spacing, rowStep, textColor, memberColor, adminColor, adminSet, glow, startIndex = 0 } = opts;
	const k = Math.max(1, size / 180); // scale badges / text with the avatar size
	ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
	let x = x0, y = y0;
	for (let i = 0; i < ids.length; i++) {
		const id = ids[i];
		const color = adminSet && adminSet.has(id) ? adminColor : memberColor;

		ctx.save();
		ctx.fillStyle = "rgba(255,255,255,0.15)";
		roundRect(ctx, x - 10, y - 10, size + 20, size + 60 * k, 20); ctx.fill();
		if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 20; }
		ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2 - 8, 0, Math.PI * 2); ctx.clip();
		const img = avatars.images[id];
		if (img) ctx.drawImage(img, x, y, size, size); else drawFallback(ctx, x, y, size);
		ctx.restore();

		ctx.save();
		ctx.strokeStyle = color; ctx.lineWidth = 4 * k;
		ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2 - 8, 0, Math.PI * 2); ctx.stroke();
		ctx.fillStyle = "rgba(0,0,0,0.7)";
		ctx.beginPath(); ctx.arc(x + 35 * k, y + 35 * k, 20 * k, 0, Math.PI * 2); ctx.fill();
		ctx.fillStyle = textColor; ctx.font = `bold ${Math.round(20 * k)}px Arial`; ctx.textAlign = "center";
		ctx.fillText(`#${startIndex + i + 1}`, x + 35 * k, y + 35 * k + 6 * k);
		const label = shortName(avatars.names[id]);
		if (label) { ctx.font = `bold ${Math.round(24 * k)}px Arial`; ctx.fillText(label, x + size / 2, y + size + 28 * k); }
		ctx.restore();

		x += size + spacing;
		if ((i + 1) % perRow === 0) { x = x0; y += rowStep; }
	}
	return y + (ids.length % perRow === 0 ? 0 : rowStep);
}

/** HD JPEG: long side capped at 4096px, quality 0.95; falls back to smaller if the file gets too big for Instagram. */
function exportJpeg(canvas, createCanvas) {
	const MAX_SIDE = 4096, MAX_BYTES = 8 * 1024 * 1024;
	const render = (side, quality) => {
		const scale = Math.min(1, side / Math.max(canvas.width, canvas.height));
		if (scale === 1) return canvas.toBuffer("image/jpeg", { quality });
		const out = createCanvas(Math.round(canvas.width * scale), Math.round(canvas.height * scale));
		const c = out.getContext("2d");
		c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
		c.drawImage(canvas, 0, 0, out.width, out.height);
		return out.toBuffer("image/jpeg", { quality });
	};
	let buffer = render(MAX_SIDE, 0.95);
	if (buffer.length > MAX_BYTES) buffer = render(3200, 0.9);
	if (buffer.length > MAX_BYTES) buffer = render(2400, 0.88);
	return buffer;
}

module.exports = { MAX_MEMBERS, roundRect, fetchImage, loadAvatars, drawFallback, getGroup, shortName, drawMemberGrid, exportJpeg };
