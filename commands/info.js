/**
 * File Name: info.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

const { resolveUserTarget, resolveProfile, download } = require("../src/utils");

function number(value) {
  return value == null ? "—" : Number(value).toLocaleString("en-US");
}

function readableError(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  try { return JSON.stringify(error); } catch (_) { return String(error); }
}

function pictureUrl(value) {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (value && typeof value === "object") {
    for (const key of ["url", "uri", "src", "profilePicture", "profile_pic_url_hd", "profile_pic_url"]) {
      if (typeof value[key] === "string" && /^https?:\/\//i.test(value[key])) return value[key];
    }
  }
  return null;
}

module.exports = {
  config: {
    name: "info", aliases: ["whois", "userinfo", "iginfo"], author: "Neoaz 🐊",
    category: "Users Cmd", cooldown: 3, role: 0,
    description: { en: "Show an Instagram user's profile details" },
    usage: { en: "{p}info [userID | @handle | username | profile URL] — or reply to a message" }
  },

  onStart: async function ({ message, args, event, api }) {
    try {
      const target = await resolveUserTarget(args, event, api);
      if (!target.id) {
        if (target.rateLimited) return message.reply("Instagram is rate-limiting lookups right now. Please try again in a few minutes.");
        if (target.username) return message.reply(`Could not find @${target.username}.`);
        return message.reply("Provide a numeric user id or @mention, or reply to a user's message.");
      }

      const profile = await resolveProfile(args, event, api);
      if (!profile) return message.reply(`Could not find user ${target.id}.`);
      if (profile.rateLimited && !profile.username && !profile.name)
        return message.reply("Instagram is rate-limiting lookups right now. Please try again in a few minutes.");

      const badges = [profile.isVerified ? "✅ Verified" : null, profile.isPrivate ? "🔒 Private" : "🌐 Public"].filter(Boolean).join(" · ");
      const lines = [
        `👤 Name: ${profile.name || profile.username || target.id}`,
        `Username: @${profile.username || "—"}`,
        `🆔 ID: ${profile.userID || target.id}`,
        badges,
        `👥 Followers: ${number(profile.followers)}`,
        `➡️ Following: ${number(profile.following)}`,
        profile.posts != null ? `🖼️ Posts: ${number(profile.posts)}` : null,
        profile.biography ? `\n📝 ${profile.biography}` : null
      ].filter(Boolean);

      const url = pictureUrl(profile.profilePicture || profile.profile_pic_url_hd || profile.profile_pic_url);
      if (url) {
        try {
          const imageBuffer = await download(url, { timeout: 20000, headers: { "User-Agent": "Mozilla/5.0" } });
          return await message.reply({ body: lines.join("\n"), attachment: { buffer: imageBuffer, mimetype: "image/jpeg" }, textFirst: true });
        } catch (error) {
          // Keep profile details useful even when Instagram blocks the image CDN.
          lines.push("\n⚠️ DP download blocked by Instagram; profile details are shown below.");
        }
      }
      return message.reply(lines.join("\n"));
    } catch (error) {
      console.error("[info command]", readableError(error));
      return message.reply(`Info command error: ${readableError(error)}`);
    }
  }
};
