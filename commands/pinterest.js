/**
 * File Name: pinterest.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

const axios = require("axios");
const util = require("util");

const API_URL = "https://egret-driving-cattle.ngrok-free.app/api/pin";
const DEFAULT_COUNT = 5;
const MAX_IMAGES = 20;

function getImageUrl(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return null;

  return item.url || item.image_url || item.image ||
    item.src || item.original || item.media_url || item.link || null;
}

function getError(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;

  return [
    error.message || "",
    error.code ? "Code: " + error.code : "",
    error.response?.status ? "HTTP: " + error.response.status : "",
    error.response?.data
      ? util.inspect(error.response.data, { depth: 3 })
      : "",
    util.inspect(error, { depth: 2 })
  ].filter(Boolean).join("\n");
}

module.exports = {
  config: {
    name: "pinterest",
    aliases: ["pin", "pic"],
    author: "Tanvir143",
    category: "Users Cmd",
    cooldown: 5,
    role: 0,
    description: { en: "Search Pinterest images" },
    usage: { en: "{p}pic Sun or {p}pic Sun? 10" }
  },

  onStart: async function ({ message, args }) {
    try {
      const input = args.join(" ").trim();

      if (!input) {
        return message.reply(
          "Pinterest Image Search\n\n" +
          ".pic Sun\n" +
          ".pic Sun? 1\n" +
          ".pic Sun? 10\n" +
          ".pic Sun? 20\n\n" +
          "Default: 5 images\nMaximum: 20\n"
        );
      }

      let query = input;
      let count = DEFAULT_COUNT;
      const match = input.match(/^(.*?)\s*\?\s*(\d+)\s*$/);

      if (match) {
        query = match[1].trim();
        count = Math.max(1, Math.min(Number(match[2]), MAX_IMAGES));
      }

      if (!query) return message.reply("Please enter an image name.");

      await message.reply(
        "🪐 Pinterest searching..\nRequested Image: " + count
      );

      const response = await axios.get(API_URL, {
        params: { query, num: Math.max(count, 10) },
        timeout: 60000,
        headers: { Accept: "application/json" }
      });

      const data = response.data;
      const results = Array.isArray(data) ? data :
        Array.isArray(data?.results) ? data.results :
        Array.isArray(data?.images) ? data.images :
        Array.isArray(data?.data) ? data.data : [];

      const urls = [...new Set(results.map(getImageUrl).filter(url => {
        if (typeof url !== "string") return false;
        try {
          return ["http:", "https:"].includes(new URL(url).protocol);
        } catch {
          return false;
        }
      }))].slice(0, count);

      if (!urls.length) {
        return message.reply("No image URLs found for: " + query);
      }

      let sent = 0;
      const errors = [];

      for (let i = 0; i < urls.length; i++) {
        try {
          const img = await axios.get(urls[i], {
            responseType: "arraybuffer",
            timeout: 45000,
            maxRedirects: 5,
            headers: { "User-Agent": "Mozilla/5.0" }
          });

          const buffer = Buffer.from(img.data);
          const mime = String(img.headers["content-type"] || "")
            .split(";")[0].toLowerCase();

          if (!buffer.length) throw new Error("Empty image file");
          if (mime && !mime.startsWith("image/")) {
            throw new Error("URL returned: " + mime);
          }

          let ext = "jpg";
          if (mime.includes("png")) ext = "png";
          else if (mime.includes("webp")) ext = "webp";
          else if (mime.includes("gif")) ext = "gif";

          await message.reply({
            body: "",
            attachment: {
              buffer,
              mimetype: mime.startsWith("image/") ? mime : "image/jpeg",
              name: "pinterest_" + (i + 1) + "." + ext
            }
          });

          sent++;
        } catch (error) {
          const details = getError(error);
          console.error("[PIN IMAGE " + (i + 1) + "]\n" + details);
          errors.push(details);
        }
      }

      if (sent === 0) {
        return message.reply(
          "No images could be sent.\n" +
          "Query: " + query +
          "\nURLs found: " + urls.length +
          "\nError:\n" + (errors[0] || "Unknown error").slice(0, 1000) +
          "\n🌐"
        );
      }

      return message.reply(
        "Enjoy Using Tanvir143 Robot"
      );
    } catch (error) {
      const details = getError(error);
      console.error("[PIN COMMAND ERROR]\n" + details);
      return message.reply(
        "Pinterest search failed:\n" + details.slice(0, 1000)
      );
    }
  }
};
