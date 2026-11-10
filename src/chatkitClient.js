"use strict";

/**
 * chatkitClient — a drop-in "InstaChatClient" built on lib/instagram-chatkit.
 *
 * igAdapter.js talks to a client with the instachat-api surface (sendMessage, reply,
 * sendReaction, getConversation, on(Events.MESSAGE) ...). This class implements that
 * surface on top of instagram-chatkit (ESM, real MQTT realtime), so every InstaBOT
 * command keeps working unchanged.
 *
 * ID rules used here:
 *  - threadId  = Instagram "native" Direct thread id (what chatkit calls nativeThreadId).
 *  - message id = the web MID when Instagram gave one, else the Iris item id.
 *    A cache maps itemId <-> web MID, because chatkit needs the web MID for
 *    react / edit / unsend / markSeen but realtime events often carry the item id.
 */

const EventEmitter = require("events");
const fs = require("fs");
const path = require("path");
const Events = require("../lib/instachat-api/src/constants/events");

const str = v => (v == null ? "" : String(v));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isObject = v => v !== null && typeof v === "object" && !Array.isArray(v);
const KIT_ENTRY = path.join(__dirname, "..", "lib", "instagram-chatkit", "src", "index.js");

let kitModule = null;
async function loadKit() {
	if (kitModule) return kitModule;
	// Keep this a real dynamic import(): chatkit is an ES module and IG2 is CommonJS.
	kitModule = await import(require("url").pathToFileURL(KIT_ENTRY).href);
	return kitModule;
}

class BoundedMap extends Map {
	constructor(limit) { super(); this.limit = limit; }
	set(key, value) {
		if (this.has(key)) this.delete(key);
		super.set(key, value);
		if (this.size > this.limit) this.delete(this.keys().next().value);
		return this;
	}
}

function cookieHeader(cookies) {
	if (typeof cookies === "string") return cookies;
	return Object.entries(cookies || {}).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${v}`).join("; ");
}

function cookieMap(header) {
	const out = {};
	for (const part of String(header || "").split(";")) {
		const i = part.indexOf("=");
		if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
	}
	return out;
}

/** Instagram user (chatkit/raw shape) -> instachat-api-like user object. */
function toUser(u) {
	const raw = u || {};
	const id = str(raw.pk ?? raw.pk_id ?? raw.id ?? raw.userId ?? raw.igid);
	return {
		id,
		pk: id,
		username: raw.username || "",
		fullName: raw.full_name || raw.fullName || raw.name || raw.username || "",
		profilePicUrl: raw.profile_pic_url || raw.profilePicUrl || raw.avatar || "",
		biography: raw.biography || raw.bio || "",
		followerCount: raw.follower_count ?? raw.followerCount,
		followingCount: raw.following_count ?? raw.followingCount,
		isVerified: Boolean(raw.is_verified ?? raw.isVerified),
		isPrivate: Boolean(raw.is_private ?? raw.isPrivate),
		friendship: raw.friendship_status
			? { following: Boolean(raw.friendship_status.following), followedBy: Boolean(raw.friendship_status.followed_by) }
			: (raw.friendship || null),
		raw
	};
}

/** Map a chatkit attachment/media to the shape igAdapter.mapAttachments reads (msg.media / msg.share). */
function splitMedia(attachments) {
	let media = null;
	let share = null;
	for (const a of attachments || []) {
		if (!a || !a.type) continue;
		if (a.type === "link" || a.type === "like") continue;
		const type = ({ photo: "image", voice_media: "audio", animated_media: "gif", media: "image" })[a.type] || a.type;
		if (["clip", "media_share", "xma_share", "story_share", "reel_share"].includes(a.type)) {
			if (!share) share = { type: a.type === "clip" ? "reel" : a.type === "media_share" ? "post" : a.type, url: a.linkUrl || a.url || null, previewUrl: a.previewUrl || null };
			continue;
		}
		if (!media) media = { type, url: a.url || null, width: a.width || null, height: a.height || null, duration: a.duration || null };
	}
	return { media, share };
}

class ChatkitClient extends EventEmitter {
	constructor(options = {}) {
		super();
		this.options = options;
		this._cookies = Object.assign({}, options.cookies || {});
		this.userId = str(options.userId || this._cookies.ds_user_id);
		this.username = "";
		this.fullName = "";
		this.isConnected = false;
		this.isReady = false;
		this.kit = null;
		this._kitFactory = options.kitFactory || null; // tests inject a fake InstagramClient
		this._rt = false;
		this._pendingCookies = null;

		this.session = {
			get cookies() { return self._cookies; },
			load: ({ userId, cookies } = {}) => {
				if (cookies) { this._cookies = Object.assign({}, cookies); this._pendingCookies = true; this._icaClient = null; }
				if (userId) this.userId = str(userId);
			}
		};
		const self = this;

		this.realtime = {
			currentDelayMs: 0,
			consecutiveErrors: 0,
			get isRunning() { return self._rt; },
			start: () => { this._startRealtime().catch(e => this._fail(e)); },
			stop: () => { this._stopRealtime(); }
		};

		this.itemToMid = new BoundedMap(20000);  // itemId -> web MID
		this.midToItem = new BoundedMap(20000);  // web MID -> itemId
		this.msgThread = new BoundedMap(20000);  // any message id -> native thread id
		this.fbidOf = new BoundedMap(2000);      // native thread id -> messaging thread fbid
		this.nativeOf = new BoundedMap(2000);    // fbid -> native
		this.groupFlag = new BoundedMap(2000);   // native -> isGroup
		this.snapshots = new BoundedMap(1000);   // native -> Map<userId, user>
		this.itemAlias = new BoundedMap(5000);   // Iris item id -> id we returned when sending (ICA sends)
		this._icaClient = null;
		this.lastError = 0;
		this.seenEvents = new BoundedMap(5000);
	}

	// ---------- lifecycle ----------

	async _makeKit() {
		const header = cookieHeader(this._cookies);
		if (this._kitFactory) return this._kitFactory({ cookies: header });
		const { InstagramClient } = await loadKit();
		return new InstagramClient({
			cookies: header,
			timeoutMs: Number(this.options.requestTimeoutMs) || 20000,
			receiving: { receiveOwnMessages: true },
			logLevel: this.options.debug ? "debug" : undefined,
			logger: this.options.debug ? (r => console.log("[chatkit]", JSON.stringify(r))) : undefined
		});
	}

	async connect() {
		const kit = this.kit = await this._makeKit();
		await kit.login();
		try {
			const me = await kit.account.currentUser();
			const user = me && (me.user || me);
			if (user) {
				this.username = user.username || this.username;
				this.fullName = user.full_name || user.fullName || this.username;
				if (user.pk || user.id) this.userId = str(user.pk || user.id);
			}
		}
		catch (_) { /* username is cosmetic; the cookie already gives the id */ }
		if (!this.userId) throw new Error("account.txt has no ds_user_id cookie");

		kit.on("event", ev => { this._onEvent(ev).catch(e => this._warn(e)); });
		kit.on("state", s => this._onState(s));
		kit.on("listenerError", e => this._onListenerError(e));

		this.isConnected = true;
		this.isReady = true;
		await this._startRealtime();
		this.emit(Events.CONNECTED);
		this.emit(Events.READY);
		return this;
	}

	async _startRealtime() {
		if (this._rt || !this.kit) return;
		await this.kit.connectRealtime();
		this._rt = true;
		this.realtime.consecutiveErrors = 0;
	}

	_stopRealtime() {
		this._rt = false;
		if (this.kit) Promise.resolve(this.kit.disconnectRealtime()).catch(() => { });
	}

	async disconnect() {
		this._rt = false;
		this.isConnected = false;
		this.isReady = false;
		if (this.kit) { try { await this.kit.close(); } catch (_) { /* already closed */ } }
		this.emit(Events.DISCONNECTED, "closed");
	}

	async checkSession() {
		if (!this.kit) return false;
		try {
			if (this._pendingCookies) {
				this._pendingCookies = null;
				await this.kit.loadSession({ version: 2, cookies: cookieHeader(this._cookies) });
				this._rt = false;
			}
			return Boolean(await this.kit.isSessionValid());
		}
		catch (_) { return false; }
	}

	_warn(e) { if (this.listenerCount(Events.ERROR) > 0) this.emit(Events.ERROR, e); }
	_fail(e) { this._onListenerError(e); }

	_onState(s) {
		if (!s) return;
		if (s.state === "connected") {
			this._rt = true;
			if (this.realtime.consecutiveErrors > 0) { this.realtime.consecutiveErrors = 0; this.emit(Events.RECOVERED); }
			this.isConnected = true;
		}
		else if (s.state === "reconnecting") {
			this.isConnected = false;
			this.realtime.currentDelayMs = Number(s.nextRetryIn) || 0;
			this.emit(Events.RECONNECTING);
		}
		else if (s.state === "auth_required") {
			this._rt = false; this.isConnected = false; this.isReady = false;
			this.emit(Events.AUTH_ERROR, Object.assign(new Error("Instagram session is no longer valid. Export fresh cookies."), { code: "SESSION_EXPIRED" }));
		}
		else if (s.state === "fatal") {
			this._rt = false; this.isConnected = false;
			this.emit(Events.ERROR, Object.assign(new Error(`realtime stopped: ${s.reason || "fatal"}`), { code: s.reason }));
		}
	}

	_onListenerError(e) {
		this.realtime.consecutiveErrors++;
		if (/rate|429/i.test(`${e && e.code} ${e && e.message}`)) this.emit(Events.RATE_LIMIT, Object.assign(e || new Error("rate limited"), { retryAfter: e && e.retryAfter }));
		else this._warn(e);
	}

	// ---------- id helpers ----------

	_learn(ev) {
		const native = str(ev.nativeThreadId || ev.threadId);
		if (ev.threadFbid) { this.fbidOf.set(native, str(ev.threadFbid)); this.nativeOf.set(str(ev.threadFbid), native); }
		if (typeof ev.isGroup === "boolean") this.groupFlag.set(native, ev.isGroup);
		const item = ev.itemId ? str(ev.itemId) : "";
		const mid = ev.messageId ? str(ev.messageId) : "";
		if (item && mid && item !== mid) { this.itemToMid.set(item, mid); this.midToItem.set(mid, item); }
		for (const id of [item, mid, str(ev.id)]) if (id && native) this.msgThread.set(id, native);
	}

	/** The id other code should use for a message: the web MID if known, else the item id. */
	_publicId(ev) {
		const item = ev.itemId ? str(ev.itemId) : str(ev.id);
		if (this.itemAlias.has(item)) return this.itemAlias.get(item);
		const mid = ev.messageId ? str(ev.messageId) : "";
		if (mid && mid !== item) return mid;
		return this.itemToMid.get(item) || item;
	}

	async _fbid(native) {
		native = str(native);
		const hit = this.fbidOf.get(native);
		if (hit) return hit;
		const res = await this.kit.threads.get(native);
		const t = (res && res.thread) || {};
		const fbid = str(t.thread_fbid || t.id);
		if (!fbid) throw new Error(`Cannot resolve the messaging id of thread ${native}`);
		this.fbidOf.set(native, fbid); this.nativeOf.set(fbid, native);
		return fbid;
	}

	/** Web MID for any message id; looks in thread history when the cache has no MID yet. */
	async _mid(native, id) {
		id = str(id);
		if (this.midToItem.has(id)) return id;
		const cached = this.itemToMid.get(id);
		if (cached) return cached;
		if (/^\d+$/.test(id) || !id) {
			// numeric = Iris item id: find its web MID in the history.
			await this._scanHistory(native);
			let found = this.itemToMid.get(id);
			// An older message (a reaction on something sent a while ago): look further back once.
			if (!found) { await this._scanHistory(native, 100); found = this.itemToMid.get(id); }
			if (found) return found;
			throw new Error(`No web message id known for message ${id} yet (Instagram has not sent it).`);
		}
		return id;
	}

	async _scanHistory(native, limit = 40) {
		const res = await this.kit.threads.history(str(native), { limit: Math.min(100, limit) });
		const out = [];
		for (const m of (res && res.messages) || []) {
			this._learn(Object.assign({}, m, { nativeThreadId: native }));
			out.push(m);
		}
		return out;
	}

	// ---------- realtime events ----------

	_selfMessage(ev) { return ev.fromMe === true || str(ev.senderId) === str(this.userId); }

	_replyOf(ev) {
		const raw = ev.raw || {};
		const rep = raw.replied_to_message || raw.reply_to_message || raw.reply || null;
		const id = rep && (rep.item_id || rep.message_id || rep.id) || raw.replied_to_message_id || raw.replied_to_item_id;
		if (!id) return null;
		const sid = rep && (rep.user_id || rep.sender_id || rep.sender_igid) || raw.replied_to_user_id;
		return {
			id: this.itemToMid.get(str(id)) || str(id),
			senderId: rep && rep.is_sent_by_viewer === true ? str(this.userId) : (sid ? str(sid) : ""),
			text: (rep && (rep.text || rep.text_body)) || ""
		};
	}

	_toMessage(ev) {
		this._learn(ev);
		const { media, share } = splitMedia(ev.attachments && ev.attachments.length ? ev.attachments : (ev.media ? [ev.media] : []));
		const text = ev.itemType === "like" && !ev.text ? "❤️" : (ev.text || "");
		return {
			id: this._publicId(ev),
			itemId: ev.itemId ? str(ev.itemId) : undefined,
			threadId: str(ev.nativeThreadId || ev.threadId),
			senderId: str(ev.senderId),
			text,
			type: ev.itemType || "text",
			timestamp: ev.timestampMs || Date.now(),
			isSelf: this._selfMessage(ev),
			isGroup: typeof ev.isGroup === "boolean" ? ev.isGroup : this.groupFlag.get(str(ev.nativeThreadId || ev.threadId)),
			media, share,
			mentions: [],
			replyTo: this._replyOf(ev),
			raw: ev.raw
		};
	}

	async _onEvent(event) {
		if (!event || !event.type) return;
		const d = event.data || {};
		switch (event.type) {
			case "message": {
				const native = str(d.nativeThreadId || d.threadId);
				const key = `${native}:${d.itemId || d.id}`;
				if (this.seenEvents.has(key)) return;   // Iris can re-send the same item
				this.seenEvents.set(key, 1);
				this.realtime.consecutiveErrors = 0;
				this.emit(Events.MESSAGE, this._toMessage(d));
				break;
			}
			case "messageEdit":
				this._learn(d);
				this.emit(Events.MESSAGE_EDIT, { id: this._publicId(d), threadId: str(d.nativeThreadId), text: d.newText || "" });
				break;
			case "messageUnsend":
				this._learn(d);
				this.emit(Events.MESSAGE_UNSENT, {
					messageId: this._publicId(d), threadId: str(d.nativeThreadId), senderId: "", timestamp: Date.now()
				});
				break;
			case "reaction": {
				this._learn(d);
				const native = str(d.nativeThreadId);
				const id = this._publicId(d);
				// Iris sends the full reaction list; emit only reactions not seen before.
				const prevKey = `r:${native}:${d.itemId || d.id}`;
				const prev = this.seenEvents.get(prevKey) || new Set();
				const next = new Set();
				let reactionList = Array.isArray(d.reactions) ? d.reactions : [];
				// Some payloads carry a single reaction instead of the full list.
				if (!reactionList.length && d.change !== "remove" && (d.emoji || d.reaction) && d.senderId)
					reactionList = [{ senderId: d.senderId, emoji: d.emoji || d.reaction, timestampMs: d.timestampMs }];
				for (const r of reactionList) {
					const k = `${r.senderId}:${r.emoji}`;
					next.add(k);
					if (prev.has(k) || d.change === "remove") continue;
					this.emit(Events.REACTION, {
						messageId: id, threadId: native, senderId: str(r.senderId), emoji: r.emoji,
						isSelf: str(r.senderId) === str(this.userId), timestamp: r.timestampMs || Date.now()
					});
				}
				this.seenEvents.set(prevKey, next);
				break;
			}
			case "readReceipt":
				this.emit(Events.READ_RECEIPT, { threadId: str(d.nativeThreadId), userId: str(d.senderId), timestamp: d.timestampMs || Date.now() });
				break;
			case "threadUpdate":
				this._onThreadUpdate(d);
				break;
			default: break;
		}
	}

	/** Group member changes: diff the member list carried by the thread patch. */
	_onThreadUpdate(d) {
		const raw = d.raw;
		const native = str(d.nativeThreadId);
		if (raw && (raw.thread_fbid || raw.id)) { this.fbidOf.set(native, str(raw.thread_fbid || raw.id)); }
		if (!raw || !Array.isArray(raw.users) || !raw.users.length) return;
		const next = new Map();
		for (const u of raw.users) { const user = toUser(u); if (user.id) next.set(user.id, user); }
		if (!next.size) return;
		const prev = this.snapshots.get(native);
		this.snapshots.set(native, next);
		if (typeof raw.is_group === "boolean") this.groupFlag.set(native, raw.is_group);
		if (!prev) return;
		const added = [...next].filter(([id]) => !prev.has(id)).map(([, u]) => u);
		const removed = [...prev].filter(([id]) => !next.has(id)).map(([, u]) => u);
		if (added.length || removed.length) {
			this.emit(Events.PARTICIPANTS_CHANGED, { threadId: native, isGroup: raw.is_group !== false, added, removed, timestamp: Date.now() });
		}
	}

	// ---------- instachat-api (ICA) for what chatkit cannot do ----------
	// chatkit has no web call for removing members, declining requests, deleting a thread,
	// @mentions, gifs or stickers. lib/instagram-chat-api does them over plain HTTP with the
	// same cookies, so a second client is created lazily (never connected: no polling).

	_ica() {
		if (!this._icaClient) {
			const { InstaChatClient } = require("../lib/instagram-chat-api/src");
			this._icaClient = new InstaChatClient({
				cookies: Object.assign({}, this._cookies),
				userId: this.userId,
				sessionPath: this.options.sessionPath,
				requestTimeoutMs: Number(this.options.requestTimeoutMs) || 20000,
				maxRetries: 1,
				throttle: this.options.throttle === undefined ? {} : this.options.throttle
			});
			this._icaClient.on("error", () => { /* surfaced through the rejected call */ });
		}
		return this._icaClient;
	}

	// ---------- sending ----------

	async _toBuffer(att) {
		if (Buffer.isBuffer(att)) return { data: att };
		if (typeof att === "string") {
			if (/^https?:\/\//i.test(att)) {
				const res = await fetch(att);
				if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
				return { data: Buffer.from(await res.arrayBuffer()), name: att };
			}
			return { data: await fs.promises.readFile(att), name: att };
		}
		if (att && (typeof att.pipe === "function" || att[Symbol.asyncIterator])) {
			const chunks = [];
			for await (const c of att) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
			return { data: Buffer.concat(chunks), name: att.path };
		}
		throw new Error("Unsupported attachment type");
	}

	static _mime(buf, name) {
		const n = String(name || "").toLowerCase();
		if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
		if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
		if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return "image/webp";
		if (buf.slice(0, 3).toString() === "GIF") return "image/gif";
		if (buf.slice(4, 8).toString() === "ftyp") return /\.(m4a|aac|mp3)$/.test(n) ? "audio/mp4" : (/\.(m4a)$/.test(n) ? "audio/mp4" : "video/mp4");
		if (/\.(mp3)$/.test(n) || buf.slice(0, 3).toString() === "ID3") return "audio/mpeg";
		if (/\.(ogg|opus)$/.test(n) || buf.slice(0, 4).toString() === "OggS") return "audio/ogg";
		if (/\.(wav)$/.test(n)) return "audio/wav";
		if (/\.(m4a|aac)$/.test(n)) return "audio/mp4";
		if (/\.(mp4|mov)$/.test(n)) return "video/mp4";
		return "image/jpeg";
	}

	async _sendAttachment(native, att, replyMid) {
		const { data, name } = await this._toBuffer(att);
		let mime = ChatkitClient._mime(data, name);
		const m = this.kit.messages;
		let res;
		if (mime.startsWith("image/")) {
			if (mime !== "image/jpeg" && mime !== "image/png") {
				// chatkit accepts JPEG/PNG photos only; convert other image types through jimp when available.
				let Jimp = null;
				try { Jimp = require("jimp"); } catch (_) { /* optional */ }
				if (!Jimp) throw new Error(`Instagram web accepts only JPEG/PNG photos (got ${mime}); install jimp to auto-convert.`);
				const img = await Jimp.read(data);
				const png = await img.getBufferAsync(Jimp.MIME_PNG);
				res = await this._sendUploaded(native, png, "image/png", "image", replyMid);
				return res;
			}
			return this._sendUploaded(native, data, mime, "image", replyMid);
		}
		if (mime.startsWith("video/")) return this._sendUploaded(native, data, mime, "video", replyMid);
		if (mime.startsWith("audio/")) return this._sendUploaded(native, data, mime.startsWith("audio/mp4") ? mime : "audio/mp4", "audio", replyMid, true);
		return m.sendPhoto(native, data, { mimeType: mime });
	}

	async _sendUploaded(native, data, mimeType, type, replyMid, voice = false) {
		const m = this.kit.messages;
		if (!replyMid) {
			if (type === "image") return m.sendPhoto(native, data, { mimeType });
			if (type === "video") return m.sendVideo(native, data, { mimeType });
			return m.sendVoice(native, data, { mimeType });
		}
		// Reply with media: upload, then send as an attachment that quotes the message.
		const fbid = await this._fbid(native);
		const up = await m.upload(data, { mimeType, voice });
		return m.sendAttachment(fbid, { attachmentId: up.uploadId, type, replyToMessageId: replyMid });
	}

	_result(res, native) {
		const id = res && (res.messageId || res.messageID || res.id || (res.payload && res.payload.message_id));
		if (id) this.msgThread.set(str(id), str(native));
		return { id: id ? str(id) : null, messageID: id ? str(id) : null, threadId: str(native), timestamp: Date.now(), raw: res };
	}

	async _sendText(native, text, replyId) {
		const fbid = await this._fbid(native);
		const opts = {};
		if (replyId) {
			opts.replyToMessageId = await this._mid(native, replyId);
			const sender = this._senderOf(replyId);
			if (sender) opts.replyToUserId = sender;
		}
		let res;
		try { res = await this.kit.messages.send(fbid, text, opts); }
		catch (e) {
			// Some quote targets are rejected (e.g. system items): retry once without the quote.
			if (!replyId) throw e;
			res = await this.kit.messages.send(fbid, text, {});
		}
		return this._result(res, native);
	}

	_senderOf() { return ""; }

	/** @mentions: chatkit cannot tag people, so this one text goes through ICA's mention payload. */
	async _sendMentionText(native, text, mentions, replyId) {
		const options = { mentions };
		if (replyId) options.replyToItemId = this.midToItem.get(str(replyId)) || str(replyId);
		let res;
		try { res = await this._ica().messages.sendTextMessage(native, text, options); }
		catch (e) {
			// Mentions failed: still deliver the text through chatkit rather than losing the message.
			return this._sendText(native, text, replyId);
		}
		const out = this._result(res, native);
		const item = res && res.id ? str(res.id) : "";
		if (item && out.id) this.itemAlias.set(item, out.id);
		return out;
	}

	async sendGif(threadId, gifIdOrQuery, options = {}) {
		const res = await this._ica().sharing.sendGif(str(threadId), gifIdOrQuery, options);
		const out = this._result(res, threadId); if (res && res.id) this.itemAlias.set(str(res.id), out.id); return out;
	}

	async sendSticker(threadId, stickerId, options = {}) {
		const res = await this._ica().sharing.sendSticker(str(threadId), stickerId, options);
		const out = this._result(res, threadId); if (res && res.id) this.itemAlias.set(str(res.id), out.id); return out;
	}

	async changeBio(text) { return this.kit.users.bio(String(text)); }

	async setThreadEmoji(threadId, emoji) { return this.kit.threads.emoji(await this._fbid(threadId), String(emoji)); }

	async sendMessage(threadId, textOrPayload, options = {}) {
		const native = str(threadId);
		let payload = textOrPayload;
		if (Buffer.isBuffer(payload) || (payload && (typeof payload.pipe === "function" || payload[Symbol.asyncIterator]))) payload = { attachment: payload };
		if (typeof payload === "string" || typeof payload === "number") payload = { body: str(payload) };
		const { body, attachment, attachments, mentions } = payload || {};
		const replyId = options.replyToItemId || (payload && payload.replyToItemId) || null;
		const list = attachments || attachment;
		const results = { attachments: [] };

		if (list) {
			for (const item of (Array.isArray(list) ? list : [list])) {
				if (!item) continue;
				results.attachments.push(this._result(await this._sendAttachment(native, item, replyId), native));
			}
		}
		if (body != null && String(body).length) {
			const quote = results.attachments.length ? null : replyId;
			if (Array.isArray(mentions) && mentions.length) results.text = await this._sendMentionText(native, String(body), mentions, quote);
			else results.text = await this._sendText(native, String(body), quote);
		}
		const primary = results.text || results.attachments[0] || null;
		if (primary && results.attachments.length && results.text) {
			primary.textMessage = results.text;
			primary.attachmentMessages = results.attachments;
			primary.attachments = results.attachments;
		}
		return primary;
	}

	async reply(threadId, messageId, textOrPayload, options = {}) {
		return this.sendMessage(threadId, textOrPayload, Object.assign({}, options, { replyToItemId: messageId }));
	}

	async sendReaction(threadId, messageId, emoji) {
		const native = str(threadId);
		return this.kit.messages.react(await this._fbid(native), await this._mid(native, messageId), String(emoji));
	}

	async deleteReaction(threadId, messageId) {
		const native = str(threadId);
		return this.kit.messages.react(await this._fbid(native), await this._mid(native, messageId), "", { remove: true });
	}

	async unsendMessage(threadId, messageId) {
		const native = str(threadId);
		return this.kit.messages.unsend(await this._fbid(native), await this._mid(native, messageId));
	}

	async editMessage(threadId, messageId, newText) {
		const native = str(threadId);
		return this.kit.messages.edit(await this._fbid(native), await this._mid(native, messageId), String(newText));
	}

	async sendTypingIndicator(threadId, active = true) {
		const rt = this.kit && this.kit.realtime;
		if (!rt || typeof rt.indicateTyping !== "function") return null;
		return rt.indicateTyping(str(threadId), Boolean(active));
	}

	async markSeen(threadId, messageId) {
		const native = str(threadId);
		return this.kit.messages.markSeen(native, await this._mid(native, messageId));
	}

	// ---------- lookups ----------

	async getUserById(id) {
		const res = await this.kit.users.info(str(id));
		return toUser(res && (res.user || res));
	}

	async getUserByUsername(name) {
		const res = await this.kit.users.infoByUsername(str(name).replace(/^@/, ""));
		return toUser(res && (res.user || res));
	}

	async searchUsers(query, { limit = 15 } = {}) {
		const users = await this.kit.users.search(String(query));
		return (users || []).slice(0, limit).map(toUser);
	}

	async getFollowing(userId, { limit = 250 } = {}) {
		const out = [];
		let maxId = null;
		for (let page = 0; page < 10 && out.length < limit; page++) {
			const res = await this.kit.users.getFollowing(str(userId), maxId);
			out.push(...((res && res.users) || []).map(toUser));
			if (!res || !res.more_available || !res.next_max_id) break;
			maxId = res.next_max_id;
		}
		return out.slice(0, limit);
	}

	_toConversation(t, messages) {
		const native = str(t.thread_id || t.nativeThreadId);
		const users = (t.users || []).map(toUser);
		const fbid = str(t.thread_fbid || t.id);
		if (native && fbid && fbid !== native) { this.fbidOf.set(native, fbid); this.nativeOf.set(fbid, native); }
		const isGroup = Boolean(t.is_group);
		this.groupFlag.set(native, isGroup);
		if (users.length) this.snapshots.set(native, new Map(users.map(u => [u.id, u])));
		return {
			id: native,
			v2Id: str(t.thread_v2_id || t.thread_key || ""),
			isGroup,
			title: t.thread_title || t.title || "",
			muted: Boolean(t.muted || t.is_muted),
			imageUrl: (t.thread_image && t.thread_image.url) || t.thread_image_url || null,
			participants: users.filter(u => u.id !== str(this.userId)),
			adminUserIds: (t.admin_user_ids || []).map(str),
			nicknames: {},
			messages: messages || [],
			raw: t
		};
	}

	async getConversation(threadId) {
		const native = str(threadId);
		const res = await this.kit.threads.get(native);
		const conv = this._toConversation((res && res.thread) || {}, []);
		try {
			const hist = await this._scanHistory(native, 30);
			conv.messages = hist.map(m => ({
				id: this._publicId(m), itemId: m.itemId, senderId: str(m.senderId), text: m.text || "", timestamp: m.timestampMs,
				replyTo: this._replyOf(m), raw: m.raw,
				...splitMedia(m.attachments && m.attachments.length ? m.attachments : (m.media ? [m.media] : []))
			}));
		}
		catch (_) { /* thread metadata alone is still useful */ }
		return conv;
	}

	async _inboxConversations(folder, limit) {
		const res = await this.kit.threads.inbox({ folder });
		const out = [];
		for (const t of ((res && res.threads) || []).slice(0, limit)) {
			if (t.nativeThreadId) {
				this.fbidOf.set(str(t.nativeThreadId), str(t.id)); this.nativeOf.set(str(t.id), str(t.nativeThreadId));
				this.groupFlag.set(str(t.nativeThreadId), Boolean(t.isGroup));
			}
			out.push({
				id: str(t.nativeThreadId), v2Id: str(t.shortId), isGroup: Boolean(t.isGroup), title: t.name || "",
				muted: false, imageUrl: null, participants: [], adminUserIds: [], nicknames: {}, messages: [], raw: t
			});
		}
		return out;
	}

	async getConversations({ limit = 20 } = {}) { return this._inboxConversations("INBOX", limit); }
	async getPendingConversations({ limit = 20 } = {}) { return this._inboxConversations("PENDING", limit); }

	// ---------- groups ----------

	async addParticipants(threadId, userIds) { return this.kit.threads.addMembers(str(threadId), userIds.map(str)); }

	async removeParticipant(threadId, userIds) {
		return this._ica().threads.removeParticipant(str(threadId), (Array.isArray(userIds) ? userIds : [userIds]).map(str));
	}

	async setThreadTitle(threadId, title) { return this.kit.threads.updateTitle(str(threadId), String(title)); }

	async promoteAdmin(threadId, userIds) {
		const fbid = await this._fbid(threadId);
		const out = [];
		for (const u of userIds) out.push(await this.kit.threads.admin(fbid, str(u), true));
		return out;
	}

	async demoteAdmin(threadId, userIds) {
		const fbid = await this._fbid(threadId);
		const out = [];
		for (const u of userIds) out.push(await this.kit.threads.admin(fbid, str(u), false));
		return out;
	}

	async _userFbid(userId) {
		const res = await this.kit.users.info(str(userId));
		const u = (res && res.user) || res || {};
		const fbid = str(u.interop_messaging_user_fbid);
		if (!fbid) throw new Error(`No messaging id for user ${userId}`);
		return fbid;
	}

	async setNickname(threadId, userId, nickname) {
		try { return await this.kit.threads.nickname(await this._fbid(threadId), await this._userFbid(userId), String(nickname)); }
		catch (e) { return this._ica().nicknames.setNickname(str(threadId), str(userId), String(nickname)); }
	}

	async clearNickname(threadId, userId) {
		try { return await this.kit.threads.nickname(await this._fbid(threadId), await this._userFbid(userId), ""); }
		catch (e) { return this._ica().nicknames.setNickname(str(threadId), str(userId), ""); }
	}

	async acceptMessageRequest(threadId) { return this.kit.threads.accept(await this._fbid(threadId)); }

	async declineMessageRequest(threadId) { return this._ica().conversations.declineMessageRequest(str(threadId)); }

	async followUser(userId) { return this.kit.users.follow(str(userId)); }
	async unfollowUser(userId) { return this.kit.users.unfollow(str(userId)); }
	async leaveThread(threadId) { return this.kit.threads.leave(str(threadId)); }

	async deleteThread(threadId) { return this._ica().threads.deleteThread(str(threadId)); }

	// ---------- extras used by InstaBOT commands ----------

	async sendHuman(threadId, textOrPayload, options = {}) {
		const t = str(threadId);
		const text = typeof textOrPayload === "string" ? textOrPayload : (textOrPayload && textOrPayload.body) || "";
		try { await this.sendTypingIndicator(t, true); } catch (_) { /* cosmetic */ }
		await sleep(Math.min(3000, 300 + text.length * 25));
		try { return await this.sendMessage(t, textOrPayload, options); }
		finally { this.sendTypingIndicator(t, false).catch(() => { }); }
	}

	awaitMessage(filter, { timeout = 60000 } = {}) {
		return new Promise((resolve, reject) => {
			const done = (fn, v) => { clearTimeout(timer); this.off(Events.MESSAGE, onMsg); fn(v); };
			const onMsg = msg => { try { if (!filter || filter(msg)) done(resolve, msg); } catch (e) { done(reject, e); } };
			const timer = setTimeout(() => done(reject, new Error("awaitMessage timed out")), timeout);
			this.on(Events.MESSAGE, onMsg);
		});
	}

	waitUntilReady() { return Promise.resolve(this); }
}

module.exports = { ChatkitClient, Events, cookieHeader, cookieMap, toUser, splitMedia };
