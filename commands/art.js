/**
 * File Name: art.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

const axios = require("axios");

module.exports = {
  config: {
    name: "art",
    aliases: ["anime", "cartoon"],
    version: "2.0.0",
    author: "Tanvir143",
    helpText: "image Art",
    countDown: 10,
    role: 0,
    shortDescription: "Convert photo into anime/art",
    longDescription: "Convert a replied photo into anime, 3D, sketch and other art styles.",
    category: "Users Cmd",
    guide: {
      en: "{pn} [style]\n\nReply to an image.\n\nStyles: anime, 3d, handdrawn, sketch, artstyle, design, illustration"
    }
  },

  onStart: async function ({ message, event, args }) {
    const RAPIDAPI_KEY = "68b669391cmsh37c3421a7523d24p170181jsn08a55b50e32e";

    if (!event.messageReply) {
      return message.reply(
        "❌ | Please reply to an image!\n\n" +
        "Example:\n" +
        ".art anime\n" +
        ".art 3d\n" +
        ".art sketch"
      );
    }

    const attachments = event.messageReply.attachments || [];

    const image = attachments.find(
      item =>
        item.type === "photo" ||
        item.type === "image" ||
        item.type === "animated_image"
    );

    if (!image || !image.url) {
      return message.reply("❌ | No image found in the replied message!");
    }

    const style = (args[0] || "anime").toLowerCase();

    const styles = [
      "anime",
      "3d",
      "handdrawn",
      "sketch",
      "artstyle",
      "design",
      "illustration"
    ];

    if (!styles.includes(style)) {
      return message.reply(
        "❌ | Invalid style!\n\n" +
        "Available styles:\n" +
        "• anime\n" +
        "• 3d\n" +
        "• handdrawn\n" +
        "• sketch\n" +
        "• artstyle\n" +
        "• design\n" +
        "• illustration"
      );
    }

    try {
      await message.reply(
        `🎨 | Converting image to ${style} style...\nPlease wait.`
      );

      const apiResponse = await axios.post(
        "https://phototoanime1.p.rapidapi.com/cartoonize",
        {
          image_url: image.url,
          style: style
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-rapidapi-host": "phototoanime1.p.rapidapi.com",
            "x-rapidapi-key": RAPIDAPI_KEY
          },
          timeout: 120000
        }
      );

      const resultUrl = apiResponse.data?.image_url;

      if (!resultUrl) {
        console.error("ART API RESPONSE:", apiResponse.data);
        return message.reply(
          "❌ | API didn't return an output image."
        );
      }

      const resultImage = await axios.get(resultUrl, {
        responseType: "arraybuffer",
        timeout: 120000
      });

      return message.reply({
        body: `🎨 | ${style.toUpperCase()} style complete!`,
        attachment: resultImage.data
      });

    } catch (error) {
      console.error(
        "ART ERROR:",
        error.response?.data || error.message
      );

      return message.reply(
        "❌ | Failed to convert image.\n\n" +
        "Please try again later."
      );
    }
  }
};
