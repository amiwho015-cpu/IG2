"use strict";

/** Small helpers shared by the canvas-API commands (batslap, beautiful, horny, welcome, welcard). */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { invoke } = require("./igActions");
const { hdProfilePicture } = require("./hdpic");

async function profileOf(api, uid) {
	try {
		const info = await invoke(api, "getUserInfo", [String(uid)]);
		return (info && (info[uid] || Object.values(info)[0])) || null;
	}
	catch (_) { return null; }
}

const plainAvatar = p => (p && (p.profilePicture || p.thumbSrc || p.profilePicUrl || p.profile_pic_url_hd || p.profile_pic_url)) || null;

/** Public (HD when possible) profile picture URL - the API server has to be able to open it. */
async function avatarUrl(api, uid, profile) {
	const p = profile || await profileOf(api, uid);
	const plain = plainAvatar(p);
	let hd = null;
	try { hd = await hdProfilePicture(String(uid), [plain]); } catch (_) { /* use the plain link */ }
	return (hd && hd.url) || plain || null;
}

/** A name the card can draw (Latin letters); falls back to the @username. */
function drawableName(p, uid) {
	const clean = s => String(s || "").replace(/[^\p{Script=Latin}\p{N}\s.'_-]/gu, "").replace(/\s+/g, " ").trim();
	const name = clean(p && (p.name || p.firstName));
	if (name.length >= 2) return name.slice(0, 24);
	const handle = clean(p && (p.vanity || p.username));
	return (handle || String(uid || "Friend")).slice(0, 24);
}

function writeTemp(buffer, ext, tag = "card") {
	const file = path.join(os.tmpdir(), `${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext || "jpg"}`);
	fs.writeFileSync(file, buffer);
	setTimeout(() => fs.unlink(file, () => { }), 60000).unref();
	return file;
}

/** Who a card command is about: replied-to sender, @tag, numeric id / @username argument, else null. */
async function targetOf(event, args, api) {
	if (event.messageReply && event.messageReply.senderID) return String(event.messageReply.senderID);
	const tagged = Object.keys(event.mentions || {})[0];
	if (tagged) return String(tagged);
	const { resolveUserTarget } = require("./utils");
	const t = await resolveUserTarget(args || [], null, api).catch(() => null);
	return t && t.id ? String(t.id) : null;
}

module.exports = { profileOf, avatarUrl, drawableName, writeTemp, targetOf };
