"use strict";

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");

// External downloader services are fallbacks; the bot does not scrape private content.
const APIS = [
  "https://toshiro-api-editz6t9.vercel.app/api/downloader/alldl",
  "https://toshiro-api-editz6t9.vercel.app/api/downloader/alldlv2"
];
const HOSTS = new Set([
  "tiktok.com", "facebook.com", "fb.watch", "instagram.com",
  "youtube.com", "youtu.be", "x.com", "twitter.com", "pin.it",
  "pinterest.com", "soundcloud.com", "spotify.com", "capcut.com"
]);

function extractUrls(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s<>"']+/gi) || [];
  const out = [];
  for (let value of matches) {
    value = value.replace(/[),.!?\]}]+$/g, "");
    try {
      const u = new URL(value);
      const host = u.hostname.toLowerCase().replace(/^www\./, "");
      const supported = [...HOSTS].some(domain => host === domain || host.endsWith("." + domain));
      if (supported && !out.includes(u.toString())) out.push(u.toString());
    } catch (_) {}
  }
  return out.slice(0, 2);
}

function platformOf(url) {
  const h = new URL(url).hostname.toLowerCase();
  if (h.includes("tiktok")) return "TikTok";
  if (h.includes("facebook") || h === "fb.watch") return "Facebook";
  if (h.includes("instagram")) return "Instagram";
  if (h.includes("youtube") || h === "youtu.be") return "YouTube";
  if (h.includes("twitter") || h === "x.com") return "X/Twitter";
  if (h.includes("pinterest") || h === "pin.it") return "Pinterest";
  if (h.includes("soundcloud")) return "SoundCloud";
  if (h.includes("spotify")) return "Spotify";
  if (h.includes("capcut")) return "CapCut";
  return "Media";
}

function findMediaUrl(value, audio = false, depth = 0) {
  if (!value || depth > 9) return null;
  if (typeof value === "string") return /^https?:\/\//i.test(value) ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findMediaUrl(item, audio, depth + 1); if (found) return found; }
    return null;
  }
  if (typeof value !== "object") return null;
  const keys = audio
    ? ["audio", "audioUrl", "audio_url", "downloadMp3", "download", "downloadUrl", "url", "link"]
    : ["video", "videoUrl", "video_url", "play", "playUrl", "download", "downloadUrl", "download_url", "high_quality", "highQuality", "url", "link"];
  for (const key of keys) if (value[key]) {
    const found = findMediaUrl(value[key], audio, depth + 1);
    if (found) return found;
  }
  if (Array.isArray(value.formats)) {
    const formats = value.formats.filter(x => x && typeof x.url === "string");
    const chosen = audio
      ? formats.find(x => x.vcodec === "none" || /mp3|m4a|audio/i.test(x.ext || x.format || "")) || formats[0]
      : formats.find(x => x.vcodec !== "none" && x.acodec !== "none") || formats.find(x => x.vcodec !== "none") || formats[0];
    if (chosen) return chosen.url;
  }
  for (const [key, item] of Object.entries(value)) {
    if (["thumbnail", "cover", "avatar", "author", "user"].includes(key.toLowerCase())) continue;
    const found = findMediaUrl(item, audio, depth + 1);
    if (found) return found;
  }
  return null;
}

function extensionFor(url, audio) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if ([".mp4", ".m4v", ".webm", ".mov", ".mp3", ".m4a", ".aac", ".wav"].includes(ext)) return ext;
  } catch (_) {}
  return audio ? ".mp3" : ".mp4";
}

async function download(url, dest) {
  const response = await axios.get(url, {
    responseType: "stream", timeout: 120000, maxRedirects: 8,
    headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36", Accept: "*/*" }
  });
  const type = String(response.headers["content-type"] || "").toLowerCase();
  if (type.includes("text/html")) throw new Error("Downloader returned a webpage instead of media");
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(dest);
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
    response.data.on("error", reject);
  });
  const stat = await fs.stat(dest);
  if (!stat.size) throw new Error("Downloaded file is empty");
  if (stat.size > 48 * 1024 * 1024) throw new Error("Media is larger than 48 MB; Instagram upload limit reached");
}

async function resolveAndDownload(url, dest, audio) {
  let lastError;
  for (const endpoint of APIS) {
    try {
      const response = await axios.get(endpoint, { params: { url }, timeout: 60000, maxRedirects: 5 });
      const mediaUrl = findMediaUrl(response.data, audio);
      if (!mediaUrl) throw new Error("Downloader API response did not contain a media URL");
      await download(mediaUrl, dest);
      return { data: response.data, mediaUrl };
    } catch (error) {
      lastError = error;
      console.error("[AUTODL] endpoint failed:", endpoint, error.response?.status || error.message);
      try { await fs.remove(dest); } catch (_) {}
    }
  }
  throw lastError || new Error("All downloader services failed");
}

module.exports = {
  config: {
    name: "autodl", version: "8.0", author: "IG2",
    role: 0, category: "media",
    description: { en: "Automatically detects supported media links and downloads them" },
    guide: { en: "Send a TikTok/Facebook/Instagram/YouTube/X/Pinterest/SoundCloud/Spotify/CapCut link" }
  },
  onStart: async function () {},
  onChat: async function ({ api, event }) {
    const urls = extractUrls(event && event.body);
    if (!urls.length) return;
    const threadID = event.threadID;
    const messageID = event.messageID;
    if (!threadID) return;

    try { api.setMessageReaction("⏳", messageID, threadID, () => {}, true); } catch (_) {}

    for (const url of urls) {
      const platform = platformOf(url);
      const audio = platform === "SoundCloud" || platform === "Spotify";
      const dest = path.join(os.tmpdir(), `ig2_autodl_${Date.now()}_${Math.random().toString(36).slice(2)}${audio ? ".mp3" : ".mp4"}`);
      try {
        const resolved = await resolveAndDownload(url, dest, audio);
        try {
          await new Promise((resolve, reject) => {
            api.sendMessage({ body: `✅ ${platform} download complete`, attachment: fs.createReadStream(dest) }, threadID, error => error ? reject(error) : resolve(), messageID);
          });
        } catch (sendError) {
          // The file was downloaded but Instagram refused the upload: never stay silent,
          // give the direct link instead and show the real reason.
          console.error("[AUTODL] upload to Instagram failed:", sendError && sendError.message || sendError);
          const why = String((sendError && sendError.message) || sendError || "upload failed").slice(0, 160);
          await new Promise(resolve => {
            try {
              api.sendMessage(`⚠️ ${platform}: video download hoyeche kintu Instagram-e upload hoyni (${why}).\nDirect link: ${resolved.mediaUrl}`, threadID, () => resolve(), messageID);
            } catch (_) { resolve(); }
          });
        }
      } catch (error) {
        console.error("[AUTODL] failed:", platform, error.response?.status || error.message);
        try { api.sendMessage(`❌ ${platform} download failed: ${error.message || "unsupported/private link"}`, threadID, () => {}, messageID); } catch (_) {}
      } finally {
        try { await fs.remove(dest); } catch (_) {}
      }
    }
    try { api.setMessageReaction("✅", messageID, threadID, () => {}, true); } catch (_) {}
  }
};
