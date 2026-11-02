
/**
 * File Name: gen.js
 * ICA: igbot-api
 * Original Author: Neoaz 🐊 (credits retained)
 * Integration: Tanvir143 | IG-ROBOT
 */

"use strict";

const axios = require("axios");

const API = "https://myimg-api.vercel.app";
const TIMEOUT = 600000;
const MAX_MEDIA_SIZE = 100 * 1024 * 1024;

const MODELS = {
	imagine: {
		gen: "/generate/text-to-image",
		ar: "size",
		style: "style",
		params: ["prompt", "style", "width", "height"],
		required: ["prompt"]
	},
	flux: {
		gen: "/generate/flux-text-to-image",
		ar: "flux",
		params: ["prompt", "size"],
		required: ["prompt"]
	},
	styledit: {
		edit: "/generate/image-to-image",
		ar: "size",
		style: "style",
		params: ["style", "width", "height", "styleId"]
	},
	image: {
		edit: "/generate/image-to-image-v2",
		params: ["prompt", "maxSize"],
		required: ["prompt"]
	},
	edit: {
		edit: "/generate/edit",
		style: "preset",
		params: ["preset", "prompt", "tune"]
	},
	enhance: {
		edit: "/generate/enhance"
	},
	pretty: {
		edit: "/generate/pretty",
		params: ["level"]
	},
	restore: {
		edit: "/generate/restore"
	},
	animation: {
		edit: "/generate/animation"
	},
	eyeopen: {
		edit: "/generate/eye-open"
	},
	age: {
		edit: "/generate/change-age",
		params: ["targetAge"],
		required: ["targetAge"]
	},
	hair: {
		edit: "/generate/change-hair",
		params: ["hairType"],
		required: ["hairType"]
	},
	emotion: {
		edit: "/generate/change-emotion",
		params: ["emotionType"],
		required: ["emotionType"]
	},
	clothes: {
		edit: "/generate/change-clothes",
		params: [
			"modelUrl",
			"clothesUrl",
			"preset",
			"modelPreset"
		]
	},
	segment: {
		edit: "/generate/segment"
	},
	cartoon: {
		edit: "/generate/cartoonized",
		params: ["index"]
	},
	repaint: {
		edit: "/generate/repaint",
		style: "style",
		params: ["style"]
	},
	cosplay: {
		edit: "/generate/cosplay",
		params: ["templateUrl", "index"],
		required: ["templateUrl"]
	},
	upscale: {
		edit: "/generate/scale",
		params: ["scale", "outputFormat"]
	},
	faceswap: {
		edit: "/generate/face-swap",
		imageParam: "source",
		params: ["source", "target"],
		required: ["target"]
	},
	nsfw: {
		gen: "/generate/nsfw-text-to-image",
		edit: "/generate/nsfw-image-to-image",
		ar: "size",
		style: "stylePreset",
		params: [
			"prompt",
			"style",
			"stylePreset",
			"width",
			"height"
		],
		requiredGen: ["prompt"]
	},
	video: {
		edit: "/generate/video",
		params: ["duration", "prompt", "model", "bgmUrl"]
	},
	videoenhance: {
		edit: "/generate/video-enhance",
		imageParam: "videoUrl",
		params: ["videoUrl", "free"]
	},
	subtitle: {
		edit: "/generate/remove-subtitle",
		imageParam: "videoUrl",
		params: ["videoUrl", "bx", "by", "bw", "bh"],
		required: ["bx", "by", "bw", "bh"]
	}
};

const ALIASES = {
	targetage: "targetAge",
	hairtype: "hairType",
	emotiontype: "emotionType",
	modelurl: "modelUrl",
	clothesurl: "clothesUrl",
	modelpreset: "modelPreset",
	templateurl: "templateUrl",
	videourl: "videoUrl",
	maxsize: "maxSize",
	stylepreset: "stylePreset",
	outputformat: "outputFormat",
	bgmurl: "bgmUrl",
	styleid: "styleId"
};

const GUIDE =
	"🐊 NEOKEX GENX\n\n" +
	"🖼️ Generate:\n" +
	"• gen +imagine a cute cat\n" +
	"• gen +flux a futuristic robot\n\n" +
	"✏️ Edit (reply to an image):\n" +
	"• gen +image add a girl beside me\n" +
	"• gen +age +targetAge 50\n" +
	"• gen +hair +hairType curly\n" +
	"• gen +emotion +emotionType happy\n" +
	"• gen +enhance\n\n" +
	"📐 Aspect ratio:\n" +
	"• gen +imagine +ar 16:9 a futuristic city\n" +
	"• gen +flux +ar 1:1 a cute cat\n\n" +
	"📋 Other:\n" +
	"• gen +models\n" +
	"• gen +styles\n" +
	"• gen +help";

function parseArgs(args) {
	const flags = {};
	const promptParts = [];
	let model = "";
	let firstPlus = false;

	for (let i = 0; i < args.length; i++) {
		const token = String(args[i]);

		if (token.startsWith("+") && token.length > 1) {
			const key = token.slice(1).toLowerCase();

			if (!firstPlus) {
				firstPlus = true;

				if (
					["help", "h", "models", "styles"].includes(key)
				) {
					flags[key] = true;
					continue;
				}

				model = key;
				continue;
			}

			const next = args[i + 1];

			if (
				next !== undefined &&
				!String(next).startsWith("+") &&
				!String(next).startsWith("--")
			) {
				flags[key] = String(next);
				i++;
			} else {
				flags[key] = true;
			}

			continue;
		}

		if (token.startsWith("--") && token.length > 2) {
			const key = token.slice(2).toLowerCase();
			const next = args[i + 1];

			if (
				next !== undefined &&
				!String(next).startsWith("+") &&
				!String(next).startsWith("--")
			) {
				flags[key] = String(next);
				i++;
			} else {
				flags[key] = true;
			}

			continue;
		}

		promptParts.push(token);
	}

	return {
		model,
		flags,
		prompt: promptParts.join(" ").trim()
	};
}

function getAttachment(event, flags, model) {
	const directKeys = [
		"i",
		"img",
		"imgurl",
		"image",
		"source",
		"videoUrl",
		"videourl"
	];

	for (const key of directKeys) {
		const value = flags[key];

		if (
			typeof value === "string" &&
			/^https?:\/\//i.test(value)
		) {
			return value;
		}
	}

	const reply = event && event.messageReply;
	const attachments =
		reply && Array.isArray(reply.attachments)
			? reply.attachments
			: [];

	const videoMode = [
		"video",
		"videoenhance",
		"subtitle"
	].includes(model);

	const attachment = attachments.find(item => {
		if (!item || !item.url) {
			return false;
		}

		if (videoMode) {
			return (
				item.type === "video" ||
				/\.(mp4|mov|webm)(\?|$)/i.test(item.url)
			);
		}

		return (
			[
				"photo",
				"image",
				"animated_image",
				"gif"
			].includes(item.type) ||
			/\.(png|jpe?g|webp|gif)(\?|$)/i.test(item.url)
		);
	});

	return attachment ? attachment.url : "";
}

function ratioToSize(ratio, base = 1024) {
	const match = /^(\d+)\s*[:x/]\s*(\d+)$/i.exec(
		String(ratio || "").trim()
	);

	if (!match) {
		return null;
	}

	const w = Number(match[1]);
	const h = Number(match[2]);

	if (!w || !h || w > 100 || h > 100) {
		return null;
	}

	if (w >= h) {
		return {
			width: base,
			height: Math.max(1, Math.round((base * h) / w))
		};
	}

	return {
		width: Math.max(1, Math.round((base * w) / h)),
		height: base
	};
}

/**
 * Download generated media directly with Axios.
 * No dependency on global.utils.getStreamFromURL.
 */
async function getStreamFromURL(url) {
	const response = await axios.get(url, {
		responseType: "arraybuffer",
		timeout: 120000,
		maxContentLength: MAX_MEDIA_SIZE,
		maxBodyLength: MAX_MEDIA_SIZE,
		validateStatus: () => true
	});

	if (response.status < 200 || response.status >= 300) {
		throw new Error(
			`Media download failed (HTTP ${response.status}).`
		);
	}

	const buffer = Buffer.from(response.data);

	if (!buffer.length) {
		throw new Error("Downloaded media is empty.");
	}

	if (buffer.length > MAX_MEDIA_SIZE) {
		throw new Error("Generated media exceeds the 100 MB limit.");
	}

	const contentType = String(
		response.headers["content-type"] || ""
	).toLowerCase();

	if (
		contentType.includes("text/html") ||
		contentType.includes("application/json")
	) {
		throw new Error(
			"Media URL returned a webpage or JSON instead of a file."
		);
	}

	return buffer;
}

async function requestApi(path, params) {
	const response = await axios.get(API + path, {
		params,
		timeout: TIMEOUT,
		maxContentLength: MAX_MEDIA_SIZE,
		validateStatus: () => true
	});

	if (response.status < 200 || response.status >= 300) {
		const detail =
			response.data &&
			(response.data.message || response.data.error);

		throw new Error(
			`API HTTP ${response.status}` +
			(detail ? `: ${detail}` : "")
		);
	}

	return response.data;
}

function getResultUrl(data) {
	if (!data || typeof data !== "object") {
		return "";
	}

	const result =
		data.result && typeof data.result === "object"
			? data.result
			: data.data && typeof data.data === "object"
				? data.data
				: data;

	const url =
		result.resultUrl ||
		result.imageUrl ||
		result.videoUrl ||
		result.image_url ||
		result.url ||
		"";

	return typeof url === "string" ? url : "";
}

async function sendResult(message, data) {
	const url = getResultUrl(data);

	if (!url || !/^https?:\/\//i.test(url)) {
		console.error("[GEN] Unexpected API response:", data);

		throw new Error(
			"API response did not contain a valid media URL."
		);
	}

	const buffer = await getStreamFromURL(url);

	return message.reply({
		attachment: buffer
	});
}

async function listModels(message) {
	const lines = Object.entries(MODELS).map(([name, model]) => {
		const modes = [
			model.gen ? "generate" : "",
			model.edit ? "edit" : ""
		]
			.filter(Boolean)
			.join(" / ");

		return `• ${name} — ${modes}`;
	});

	return message.reply(
		`🧠 NEOKEX GENX Models (${lines.length})\n\n${lines.join("\n")}`
	);
}

async function listStyles(message) {
	const data = await requestApi("/nsfw-styles", {});

	if (!data || !Array.isArray(data.styles)) {
		throw new Error("The API did not return a styles list.");
	}

	const lines = data.styles.map(item =>
		`• ${
			typeof item === "string"
				? item
				: item.name || item.id || JSON.stringify(item)
		}`
	);

	return message.reply(
		`🔞 Styles (${lines.length})\n\n${lines.join("\n")}`
	);
}

function react(api, message, messageID, emoji) {
	try {
		if (
			api &&
			typeof api.setMessageReaction === "function"
		) {
			api.setMessageReaction(
				emoji,
				messageID,
				() => {},
				true
			);
			return;
		}
	} catch (_) {}

	try {
		if (message && typeof message.reaction === "function") {
			message.reaction(emoji, messageID);
		}
	} catch (_) {}
}

module.exports = {
	config: {
		name: "gen",
		aliases: ["genx", "imagine"],
		version: "2.4.1",
		author: "Neoaz 🐊",
		cooldown: 5,
		role: 0,
		description: {
			en: "Generate and edit images using NEOKEX GENX"
		},
		category: "image",
		usage: {
			en: "{p}gen +imagine a cute cat"
		}
	},

	onStart: async function ({ api, message, args, event }) {
		const parsed = parseArgs(
			Array.isArray(args) ? args : []
		);

		const flags = parsed.flags;
		const modelName = parsed.model;
		const prompt = parsed.prompt;
		const messageID = event && event.messageID;

		if (!args || !args.length || flags.help || flags.h) {
			return message.reply(GUIDE);
		}

		if (flags.models) {
			return listModels(message);
		}

		if (flags.styles) {
			try {
				return await listStyles(message);
			} catch (error) {
				return message.reply(
					`❌ Styles error: ${error.message}`
				);
			}
		}

		if (modelName && !MODELS[modelName]) {
			return message.reply(
				`❌ Unknown model: ${modelName}\nUse: gen +models`
			);
		}

		const model =
			MODELS[modelName] ||
			(prompt ? MODELS.imagine : MODELS.image);

		const image = getAttachment(
			event,
			flags,
			modelName
		);

		const mode = image ? "edit" : "gen";
		const path = image ? model.edit : model.gen;

		if (!path) {
			return message.reply(
				`❌ ${modelName || "This"} model does not support ${mode} mode.`
			);
		}

		if (image && !model.edit) {
			return message.reply(
				"❌ This model does not support editing."
			);
		}

		const allowed = new Set(
			(model.params || []).map(key => key.toLowerCase())
		);

		["i", "img", "imgurl", "image"].forEach(key => {
			allowed.add(key);
		});

		if (model.ar) {
			allowed.add("ar");
		}

		if (model.style) {
			allowed.add("s");
		}

		for (const key of Object.keys(flags)) {
			if (!allowed.has(key)) {
				return message.reply(
					`❌ Unknown parameter: +${key}`
				);
			}
		}

		const params = {};

		if (image) {
			params[model.imageParam || "imgurl"] = image;
		}

		if (prompt) {
			params.prompt = prompt;
		}

		for (const key of Object.keys(flags)) {
			const value = flags[key];

			if (value === true) {
				continue;
			}

			if (
				["i", "img", "imgurl", "image"].includes(key)
			) {
				continue;
			}

			if (key === "ar") {
				const size = ratioToSize(value);

				if (!size) {
					return message.reply(
						"❌ Invalid aspect ratio. Example: +ar 16:9"
					);
				}

				if (model.ar === "flux") {
					params.size =
						`${size.width}x${size.height}`;
				} else if (model.ar) {
					params.width = size.width;
					params.height = size.height;
				} else {
					return message.reply(
						"❌ Aspect ratio is not supported by this model."
					);
				}

				continue;
			}

			if (key === "s") {
				if (!model.style) {
					return message.reply(
						"❌ This model does not support +s."
					);
				}

				params[model.style] = value;
				continue;
			}

			const paramName = ALIASES[key] || key;

			if (allowed.has(key)) {
				params[paramName] = value;
			}
		}

		if (
			modelName === "nsfw" &&
			!image &&
			!params.prompt
		) {
			return message.reply(
				"❌ +nsfw mode requires a prompt."
			);
		}

		const required = image
			? model.required || []
			: model.requiredGen || model.required || [];

		const missing = required.filter(key =>
			params[key] === undefined ||
			params[key] === ""
		);

		if (missing.length) {
			return message.reply(
				`❌ Missing required parameter(s): ${
					missing.map(key => "+" + key).join(", ")
				}`
			);
		}

		react(api, message, messageID, "⌛");

		try {
			const data = await requestApi(path, params);

			if (
				!data ||
				data.ok === false ||
				data.success === false
			) {
				throw new Error(
					(data && (data.message || data.error)) ||
					"API returned an unsuccessful response."
				);
			}

			await sendResult(message, data);

			react(api, message, messageID, "✅");
		} catch (error) {
			console.error(
				"[Tanvir143 | IG-ROBOT | gen]",
				error.stack || error.message
			);

			react(api, message, messageID, "❌");

			return message.reply(
				`❌ Generation failed.\n${error.message || String(error)}`
			);
		}
	}
};
