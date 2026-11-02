/**
 * File Name: imagine.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

const axios = require("axios");

const API_URL = "https://www.ahm7xmakki.com/api/tti";

module.exports = {
	config: {
		name: "imagine",
		aliases: ["make", "aiimage", "aipic"],
		version: "1.0.0",
		author: "Tanvir143",
		helpText: "Ai Image make",
		countDown: 10,
		role: 0,
		category: "Users Cmd",
		shortDescription: "Generate AI image",
		longDescription: "Generate an AI image from a text prompt using PixelSter.",
		guide: {
			en: "{pn} <prompt>\nExample: {pn} a boy watching TV, wearing a jersey with TANVIR clearly written on it"
		}
	},

	onStart: async function ({ message, args }) {
		if (!args.length) {
			return message.reply(
				"❌ | Please provide an image prompt!\n\n" +
				"Example:\n" +
				".imagine a boy watching TV, wearing a football jersey with TANVIR clearly written on the back"
			);
		}

		const prompt = args.join(" ");

		try {
			await message.reply(
				"🎁 | Creating your Ai image...\n" +
				"⏳ | Please wait 1-3 minutes."
			);

			const response = await axios.post(
				API_URL,
				{
					prompt: prompt,
					ratio: "1:1"
				},
				{
					headers: {
						"Content-Type": "application/json",
						"User-Agent": "Tanvir143-InstaBot/1.0"
					},
					timeout: 180000
				}
			);

			const data = response.data;

			console.log("[IMAGINE] API Response:", data);

			// Try common response fields
			const imageUrl =
				data?.url ||
				data?.image ||
				data?.imageUrl ||
				data?.image_url ||
				data?.data?.url ||
				data?.data?.image ||
				data?.result?.url;

			if (!imageUrl) {
				console.error(
					"[IMAGINE] No image URL found:",
					data
				);

				return message.reply(
					"❌ | Image was generated but the API didn't return an image URL."
				);
			}

			const imageResponse = await axios.get(
				imageUrl,
				{
					responseType: "arraybuffer",
					timeout: 120000
				}
			);

			const imageBuffer = Buffer.from(
				imageResponse.data
			);

			return message.reply({
				body:
					"🎁 | Ai Image Generated\n\n" +
					`📜 | Prompt: ${prompt}`,
				attachment: imageBuffer
			});

		} catch (error) {
			console.error(
				"[IMAGINE ERROR]",
				error.response?.data || error.message
			);

			if (
				error.code === "ECONNABORTED" ||
				error.code === "ETIMEDOUT"
			) {
				return message.reply(
					"⏰ | Image generation timed out.\n" +
					"Please try again."
				);
			}

			const apiError =
				error.response?.data?.message ||
				error.response?.data?.error;

			return message.reply(
				"❌ | Failed to generate image." +
				(apiError ? `\n\n📌 | ${apiError}` : "")
			);
		}
	}
};
