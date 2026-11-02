
/**
 * File Name: fakechat.js
 * ICA: igbot-api
 * Project: IG-ROBOT
 * Author: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 *
 * Fake Instagram DM generator — local rendering with Sharp.
 */

"use strict";

const axios = require("axios");
const sharp = require("sharp");

const WIDTH = 900;
const HEIGHT = 1400;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

module.exports = {
	config: {
		name: "fakechat",
		aliases: ["fc", "fake"],
		version: "4.0.0",
		author: "Tanvir143",
		cooldown: 5,
		role: 0,
		description: "Generate a realistic Instagram-style chat image locally.",
		category: "image",
		guide: "{pn} <text> [--name name] [--user @mention] [--theme dark|light] [--time 10:30 PM] [--own text] [--attachment imageURL]"
	},

	onStart: async function ({ args, message, event, api }) {
		try {
			const options = parseArgs(args);

			const chatText = options.text.trim();
			if (!chatText && !options.own) {
				return message.reply(
					"❌ একটি মেসেজ লিখো।\nউদাহরণ: .fakechat Hello bro"
				);
			}

			const theme = (options.theme || "dark").toLowerCase();
			if (!["dark", "light"].includes(theme)) {
				return message.reply(
					"❌ Theme শুধু dark অথবা light হতে পারবে।"
				);
			}

			const targetID =
				options.userID ||
				event.messageReply?.senderID ||
				event.senderID;

			const senderID = String(event.senderID);
			const isOwn = Boolean(options.own);

			const [target, sender] = await Promise.all([
				getProfile(api, targetID),
				isOwn ? getProfile(api, senderID) : Promise.resolve(null)
			]);

			const displayName =
				options.name ||
				target.name ||
				target.username ||
				"Instagram User";

			const targetAvatar = await getAvatar(target.avatar);
			const senderAvatar = sender
				? await getAvatar(sender.avatar)
				: null;

			let attachedImage = null;

			if (options.attachment) {
				attachedImage = await downloadImage(options.attachment);
			} else if (
				event.messageReply?.attachments?.length
			) {
				const attachment = event.messageReply.attachments.find(
					item => item.type === "photo" || item.type === "image"
				);

				if (attachment?.url) {
					try {
						attachedImage = await downloadImage(attachment.url);
					} catch {}
				}
			}

			const image = await createChatImage({
				text: chatText || " ",
				name: displayName,
				username: target.username || "",
				targetAvatar,
				senderAvatar,
				attachment: attachedImage,
				time: options.time || currentTime(),
				theme,
				own: options.own,
				senderName: sender?.name || "You"
			});

			return message.reply({
				body: "✨ FakeChat image তৈরি হয়েছে!",
				attachment: image
			});
		} catch (error) {
			console.error(
				"[Tanvir143 | igBot] FakeChat Error:",
				error?.stack || error
			);

			return message.reply(
				"❌ FakeChat image তৈরি করা যায়নি।\nকারণ: " +
				(error.message || "Unknown error")
			);
		}
	}
};

function parseArgs(args) {
	const options = {
		text: "",
		name: "",
		userID: "",
		theme: "dark",
		time: "",
		own: "",
		attachment: ""
	};

	const input = [...args];
	const textParts = [];

	const optionNames = new Set([
		"--name", "--user", "--theme", "--time",
		"--own", "--attachment"
	]);

	for (let i = 0; i < input.length; i++) {
		const arg = String(input[i]);

		if (!optionNames.has(arg)) {
			textParts.push(arg);
			continue;
		}

		const value = input[i + 1];
		if (value === undefined) continue;

		if (arg === "--name") options.name = String(value);
		if (arg === "--theme") options.theme = String(value);
		if (arg === "--time") options.time = String(value);
		if (arg === "--own") options.own = String(value);
		if (arg === "--attachment") options.attachment = String(value);

		if (arg === "--user") {
			options.userID = String(value).replace(/[<@!>]/g, "");
		}

		i++;
	}

	options.text = textParts.join(" ");
	return options;
}

async function getProfile(api, userID) {
	const fallback = {
		id: String(userID),
		name: "Instagram User",
		username: "",
		avatar: null
	};

	try {
		if (!api || typeof api.getUserInfo !== "function") {
			return fallback;
		}

		// ICA installations may expose Promise- or callback-based methods.
		const result = await new Promise(resolve => {
			let finished = false;

			const done = (err, data) => {
				if (finished) return;
				finished = true;
				resolve(err ? null : data);
			};

			try {
				const returned = api.getUserInfo(
					String(userID),
					(err, data) => done(err, data)
				);

				if (returned && typeof returned.then === "function") {
					returned.then(data => done(null, data)).catch(() => done(true));
				} else if (returned && typeof returned === "object") {
					done(null, returned);
				}
			} catch {
				done(true);
			}

			// No timer is needed; a missing result falls back through the
			// callback/Promise paths above when the API resolves.
		});

		const info =
			result?.[userID] ||
			result?.data?.[userID] ||
			result?.userInfo?.[userID] ||
			result?.data ||
			result;

		if (!info || typeof info !== "object") return fallback;

		return {
			id: String(info.userID || info.id || userID),
			name:
				info.name ||
				info.fullName ||
				info.firstName ||
				info.vanity ||
				"Instagram User",
			username: info.vanity || info.username || "",
			avatar:
				info.thumbSrc ||
				info.profilePicUrl ||
				info.profilePicture ||
				info.profile_pic_url ||
				info.profile_pic_url_hd ||
				info.avatarUrl ||
				info.avatar ||
				info.picture ||
				info.photoUrl ||
				info.image ||
				info.url ||
				null
		};
	} catch {
		return fallback;
	}
}

async function downloadImage(url) {
	if (!url || typeof url !== "string") {
		throw new Error("Image URL পাওয়া যায়নি।");
	}

	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error("Image URL সঠিক নয়।");
	}

	if (!["https:", "http:"].includes(parsed.protocol)) {
		throw new Error("শুধু HTTP/HTTPS image URL গ্রহণযোগ্য।");
	}

	const response = await axios.get(parsed.href, {
		responseType: "arraybuffer",
		timeout: 15000,
		maxContentLength: MAX_IMAGE_SIZE,
		maxBodyLength: MAX_IMAGE_SIZE,
		validateStatus: status => status >= 200 && status < 300
	});

	const buffer = Buffer.from(response.data);

	if (!buffer.length || buffer.length > MAX_IMAGE_SIZE) {
		throw new Error("Image ফাইলটি খালি অথবা অতিরিক্ত বড়।");
	}

	const metadata = await sharp(buffer).metadata();
	if (!metadata.format || !["jpeg", "png", "webp", "gif"].includes(metadata.format)) {
		throw new Error("URL থেকে বৈধ image পাওয়া যায়নি।");
	}

	return sharp(buffer)
		.rotate()
		.resize(500, 500, { fit: "cover" })
		.png()
		.toBuffer();
}

async function getAvatar(url) {
	if (!url) return null;

	try {
		return await downloadImage(url);
	} catch {
		return null;
	}
}

function escapeXml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function currentTime() {
	return new Date().toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
		timeZone: "Asia/Dhaka"
	});
}

function initials(name) {
	return String(name || "U")
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map(part => part[0] || "")
		.join("")
		.toUpperCase();
}

function roundedRect(x, y, w, h, r, fill) {
	return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
}

function avatarPlaceholder(name, size) {
	const label = escapeXml(initials(name));
	const svg = `
	<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
	  <defs>
	    <linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
	      <stop offset="0" stop-color="#e1306c"/>
	      <stop offset="1" stop-color="#833ab4"/>
	    </linearGradient>
	  </defs>
	  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#a)"/>
	  <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle"
	    font-family="Arial,sans-serif" font-size="${size * 0.34}"
	    font-weight="600" fill="#fff">${label}</text>
	</svg>`;

	return Buffer.from(svg);
}

async function circleAvatar(buffer, name, size) {
	const source = buffer || avatarPlaceholder(name, size);

	const circleMask = Buffer.from(`
	<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
	  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/>
	</svg>`);

	return sharp(source)
		.resize(size, size, { fit: "cover" })
		.composite([{ input: circleMask, blend: "dest-in" }])
		.png()
		.toBuffer();
}

async function createChatImage(data) {
	const dark = data.theme === "dark";

	const bg = dark ? "#000000" : "#ffffff";
	const panel = dark ? "#000000" : "#ffffff";
	const primary = dark ? "#f5f5f5" : "#262626";
	const secondary = dark ? "#a8a8a8" : "#737373";
	const border = dark ? "#262626" : "#dbdbdb";
	const incoming = dark ? "#262626" : "#efefef";
	const outgoing = "#3797f0";
	const bubbleText = "#ffffff";

	const avatar = await circleAvatar(
		data.targetAvatar,
		data.name,
		100
	);

	const senderAvatar = data.senderAvatar
		? await circleAvatar(data.senderAvatar, data.senderName, 72)
		: null;

	const headerName = escapeXml(data.name);
	const headerUsername = escapeXml(data.username);
	const time = escapeXml(data.time);
	const text = escapeXml(data.text);
	const own = escapeXml(data.own);
	const senderName = escapeXml(data.senderName);

	const elements = [];

	// Screen background and top status bar.
	elements.push(roundedRect(0, 0, WIDTH, HEIGHT, 0, bg));

	elements.push(`
	<g font-family="Arial, Helvetica, sans-serif">
	  <text x="46" y="48" fill="${primary}" font-size="25" font-weight="700">9:41</text>
	  <g transform="translate(730,25)" fill="none" stroke="${primary}" stroke-width="4" stroke-linecap="round">
	    <path d="M0 20 L0 11 M12 20 L12 7 M24 20 L24 2"/>
	    <path d="M49 5 Q65 -8 81 5 M56 12 Q65 5 74 12" />
	  </g>
	  <rect x="832" y="25" width="42" height="20" rx="5" fill="none" stroke="${primary}" stroke-width="3"/>
	  <rect x="836" y="29" width="29" height="12" rx="2" fill="${primary}"/>
	  <rect x="875" y="31" width="4" height="8" rx="2" fill="${primary}"/>
	</g>`);

	// Header.
	elements.push(`
	<g font-family="Arial, Helvetica, sans-serif">
	  <path d="M44 105 L22 127 L44 149" stroke="${primary}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
	  <circle cx="110" cy="127" r="43" fill="${border}"/>
	  <text x="174" y="121" fill="${primary}" font-size="28" font-weight="700">${headerName}</text>
	  <text x="174" y="153" fill="${secondary}" font-size="19">${headerUsername ? "@" + headerUsername : "Instagram"}</text>
	  <g transform="translate(720,105)" fill="none" stroke="${primary}" stroke-width="4" stroke-linecap="round">
	    <path d="M0 8 Q17 -9 34 8 Q17 28 0 8Z"/>
	    <circle cx="17" cy="8" r="5"/>
	  </g>
	  <path d="M815 108 L838 130 L815 152 M838 130 L862 130" fill="none" stroke="${primary}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
	</g>`);

	// Avatar is overlaid separately for realistic circular cropping.
	const composites = [
		{ input: avatar, left: 67, top: 84 }
	];

	elements.push(`<line x1="0" y1="180" x2="${WIDTH}" y2="180" stroke="${border}" stroke-width="2"/>`);

	// Message timestamp.
	elements.push(`
	<text x="${WIDTH / 2}" y="235" text-anchor="middle"
	  font-family="Arial,sans-serif" font-size="19" fill="${secondary}">${time}</text>`);

	let y = 280;

	// Incoming message.
	const lines = wrapText(data.text || " ", 32);
	const incomingHeight = Math.max(78, lines.length * 37 + 34);
	const incomingWidth = Math.min(620, Math.max(160, longestLine(lines) * 17 + 55));

	elements.push(roundedRect(110, y, incomingWidth, incomingHeight, 30, incoming));

	lines.forEach((line, i) => {
		elements.push(`
		<text x="139" y="${y + 47 + i * 37}" font-family="Arial,sans-serif"
		  font-size="28" fill="${primary}">${escapeXml(line)}</text>`);
	});

	if (data.attachment) {
		const imageTop = y + incomingHeight + 18;
		elements.push(roundedRect(110, imageTop, 390, 300, 22, incoming));
		composites.push({
			input: await sharp(data.attachment)
				.resize(370, 270, { fit: "cover" })
				.png()
				.toBuffer(),
			left: 120,
			top: imageTop + 10
		});
		y = imageTop + 320;
	} else {
		y += incomingHeight + 35;
	}

	// Optional outgoing message.
	if (data.own) {
		const ownLines = wrapText(data.own, 29);
		const ownHeight = Math.max(78, ownLines.length * 37 + 34);
		const ownWidth = Math.min(600, Math.max(160, longestLine(ownLines) * 17 + 55));
		const ownX = WIDTH - ownWidth - 36;
		const ownY = Math.min(y + 25, 930);

		elements.push(roundedRect(ownX, ownY, ownWidth, ownHeight, 30, outgoing));

		ownLines.forEach((line, i) => {
			elements.push(`
			<text x="${ownX + 28}" y="${ownY + 47 + i * 37}"
			  font-family="Arial,sans-serif" font-size="28" fill="${bubbleText}">${escapeXml(line)}</text>`);
		});

		if (senderAvatar) {
			composites.push({
				input: senderAvatar,
				left: WIDTH - 100,
				top: ownY + ownHeight + 15
			});
		}

		y = ownY + ownHeight + 50;
	}

	// Seen status and input bar.
	elements.push(`
	<g font-family="Arial,sans-serif">
	  <text x="36" y="${HEIGHT - 174}" fill="${secondary}" font-size="17"> </text>
	  <line x1="0" y1="${HEIGHT - 145}" x2="${WIDTH}" y2="${HEIGHT - 145}" stroke="${border}" stroke-width="2"/>
	  <rect x="25" y="${HEIGHT - 122}" width="850" height="78" rx="39" fill="${dark ? "#262626" : "#f2f2f2"}"/>
	  <circle cx="68" cy="${HEIGHT - 83}" r="22" fill="#3797f0"/>
	  <circle cx="68" cy="${HEIGHT - 83}" r="12" fill="none" stroke="#fff" stroke-width="3"/>
	  <path d="M68 ${HEIGHT - 98} V${HEIGHT - 68} M53 ${HEIGHT - 83} H83" stroke="#fff" stroke-width="3"/>
	  <text x="111" y="${HEIGHT - 74}" fill="${secondary}" font-size="23">Message...</text>
	  <circle cx="773" cy="${HEIGHT - 83}" r="20" fill="none" stroke="${primary}" stroke-width="4"/>
	  <path d="M761 ${HEIGHT - 83} Q773 ${HEIGHT - 100} 785 ${HEIGHT - 83} Q773 ${HEIGHT - 66} 761 ${HEIGHT - 83}" fill="none" stroke="${primary}" stroke-width="3"/>
	  <path d="M822 ${HEIGHT - 100} L843 ${HEIGHT - 83} L822 ${HEIGHT - 66} Z" fill="${primary}"/>
	</g>`);

	const svg = Buffer.from(`
	<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
	  ${elements.join("\n")}
	</svg>`);

	const base = await sharp(svg).png().toBuffer();

	return sharp(base)
		.composite(composites)
		.png()
		.toBuffer();
}

function wrapText(text, maxChars) {
	const words = String(text || " ").split(/\s+/);
	const lines = [];
	let line = "";

	for (const word of words) {
		if (!line) {
			line = word;
		} else if ((line + " " + word).length <= maxChars) {
			line += " " + word;
		} else {
			lines.push(line);
			line = word;
		}
	}

	if (line) lines.push(line);
	return lines.length ? lines : [" "];
}

function longestLine(lines) {
	return Math.max(1, ...lines.map(line => line.length));
}
