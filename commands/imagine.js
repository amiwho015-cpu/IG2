/* Tanvir143 Imagine command adapted for IG2's GoatBot-compatible message API. */
"use strict";
const axios = require("axios");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const API_URL = process.env.IMAGINE_API_URL || "https://www.ahm7xmakki.com/api/tti";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
function findImageUrl(value, depth = 0) {
  if (!value || depth > 5) return null;
  if (typeof value === "string") return /^https?:\/\/\S+$/i.test(value) ? value : null;
  if (Array.isArray(value)) { for (const x of value) { const u = findImageUrl(x, depth + 1); if (u) return u; } return null; }
  if (typeof value === "object") {
    for (const k of ["url", "image", "imageUrl", "image_url", "output", "result"]) if (value[k] != null) { const u = findImageUrl(value[k], depth + 1); if (u) return u; }
    for (const x of Object.values(value)) { const u = findImageUrl(x, depth + 1); if (u) return u; }
  }
  return null;
}
function extFrom(type, b) {
  const h = b.subarray(0, 12).toString("hex");
  if (h.startsWith("89504e470d0a1a0a")) return "png";
  if (h.startsWith("ffd8ff")) return "jpg";
  if (h.startsWith("47494638")) return "gif";
  if (h.startsWith("52494646") && h.includes("57454250")) return "webp";
  if (/png/i.test(type)) return "png"; if (/gif/i.test(type)) return "gif"; if (/webp/i.test(type)) return "webp"; return "jpg";
}
module.exports = {
  config: { name: "imagine", aliases: ["make", "aiimage", "aipic"], version: "1.1.0", author: "Tanvir143 / IG2 integration", countDown: 10, role: 0, category: "AI", shortDescription: "Generate an AI image", longDescription: "Generate an image using Tanvir PixelSter TTI.", guide: "{pn} <prompt>" },
  onStart: async function ({ message, args }) {
    const prompt = args.join(" ").trim();
    if (!prompt) return message.reply("❌ | Please provide an image prompt. Example: -imagine a cinematic portrait under neon lights");
    let tempFile;
    try {
      await message.reply("🎨 | Creating your image. Please wait...");
      const res = await axios.post(API_URL, { prompt, ratio: "1:1" }, { headers: { "Content-Type": "application/json", "User-Agent": "Tanvir143-IG2/1.1" }, responseType: "arraybuffer", timeout: 180000, maxContentLength: MAX_IMAGE_BYTES, maxBodyLength: MAX_IMAGE_BYTES, validateStatus: () => true });
      const type = String(res.headers["content-type"] || "");
      let buffer;
      if (type.toLowerCase().startsWith("image/")) buffer = Buffer.from(res.data);
      else {
        let data;
        try { data = JSON.parse(Buffer.from(res.data).toString("utf8")); }
        catch (_) { throw new Error(`Unexpected API response (HTTP ${res.status})`); }
        const url = findImageUrl(data);
        if (url) {
          const img = await axios.get(url, { responseType: "arraybuffer", timeout: 120000, maxContentLength: MAX_IMAGE_BYTES, headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*,*/*" } });
          buffer = Buffer.from(img.data);
        } else {
          const b64 = data?.base64 || data?.image_base64 || data?.data?.base64;
          if (typeof b64 === "string") buffer = Buffer.from(b64.replace(/^data:image\/[^;]+;base64,/i, ""), "base64");
          else throw new Error(data?.message || data?.error || `API returned HTTP ${res.status} without image data`);
        }
      }
      if (!buffer || buffer.length < 1000) throw new Error("Generated image was empty or invalid");
      if (buffer.length > MAX_IMAGE_BYTES) throw new Error("Image exceeds 20 MB");
      tempFile = path.join(os.tmpdir(), `ig2-imagine-${Date.now()}.${extFrom(type, buffer)}`);
      await fs.writeFile(tempFile, buffer);
      return await message.reply({ body: `🎨 | AI Image Generated\n📝 | Prompt: ${prompt}`, attachment: fs.createReadStream(tempFile) });
    } catch (e) {
      const detail = e?.response?.data?.message || e?.message || String(e);
      console.error("[imagine] failed:", detail);
      return message.reply(`❌ | Imagine failed: ${String(detail).slice(0, 220)}`);
    } finally {
      if (tempFile) { const t = setTimeout(() => fs.remove(tempFile).catch(() => {}), 30000); if (t.unref) t.unref(); }
    }
  }
};
