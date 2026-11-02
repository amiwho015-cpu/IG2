
/**
 * File Name: midjourney.js
 * ICA: igbot-api
 * Author: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 */

"use strict";

const axios = require("axios");

const API = "https://toshiro-api-editz6t9.vercel.app/api/image/mj";

module.exports = {
  config: {
    name: "midjourney",
    aliases: ["mj", "midj"],
    version: "1.6.0",
    author: "Tanvir Ahmed (API BY Toshiro Editz)",
    cooldown: 7,
    role: 0,
    shortDescription: "Generate MidJourney images",
    description: "Generate and send all images automatically",
    category: "users cmd",
    guide: "{pn} <prompt>"
  },

  onStart: async function ({ api, event, args, message }) {
    const prompt = args.join(" ").trim();
    const threadID = event.threadID;

    const react = emoji =>
      api.setMessageReaction(emoji, event.messageID, () => {});

    if (!prompt) {
      react("❌");
      return message.reply("❌ Example: .mj a cute cat");
    }

    let status;

    try {
      react("⏳");

      status = await new Promise((resolve, reject) =>
        api.sendMessage(
          "⏳ MJ GENERATING IMAGE...",
          threadID,
          (err, info) => err ? reject(err) : resolve(info)
        )
      );

      const { data } = await axios.get(API, {
        params: { prompt },
        timeout: 180000
      });

      if (data?.success !== true) {
        throw new Error(data?.message || "API generation failed");
      }

      const result = data.result || {};

      const images = [
        ...new Set(
          (Array.isArray(result.images) ? result.images : [])
            .filter(url =>
              typeof url === "string" &&
              /^https?:\/\//i.test(url)
            )
        )
      ];

      if (
        !images.length &&
        typeof result.image === "string" &&
        /^https?:\/\//i.test(result.image)
      ) {
        images.push(result.image);
      }

      if (!images.length) {
        throw new Error("No image URLs returned");
      }

      for (const url of images) {
        const response = await axios.get(url, {
          responseType: "stream",
          timeout: 60000
        });

        await new Promise((resolve, reject) =>
          api.sendMessage(
            { attachment: response.data },
            threadID,
            err => err ? reject(err) : resolve()
          )
        );
      }

      react("✅");
    } catch (error) {
      react("❌");

      console.error(
        "[TANVIR143 MJ ERROR]",
        error.response?.data || error.message
      );

      return message.reply(
        "❌ Image generation/send failed. Please try again."
      );
    } finally {
      if (status?.messageID) {
        api.unsendMessage(status.messageID, () => {});
      }
    }
  }
};
