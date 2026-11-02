
/**
 * File Name: uptime.js
 * ICA: igbot-api
 * Author: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 */

"use strict";

module.exports = {
  config: {
    name: "uptime",
    aliases: ["up", "status"],
    version: "1.0.0",
    author: "Tanvir Ahmed (Tanvir143)",
    countDown: 5,
    cooldown: 6,
    role: 0,
    shortDescription: "Show bot uptime and statistics",
    category: "Users cmd"
  },

  onStart: async function ({ message, api }) {
    const formatUptime = (ms) => {
      const totalSeconds = Math.floor(ms / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      const parts = [];

      if (days) parts.push(`${days}d`);
      if (hours) parts.push(`${hours}h`);
      if (minutes) parts.push(`${minutes}m`);

      parts.push(`${seconds}s`);

      return parts.join(" ");
    };

    const startedAt = global.instabotStartedAt || Date.now();
    const uptime = formatUptime(Date.now() - startedAt);

    let users = "N/A";
    let groups = "N/A";

    try {
      const db = global.database;

      if (db) {
        const [userCount, groupCount] = await Promise.all([
          typeof db.users?.countDocuments === "function"
            ? db.users.countDocuments()
            : typeof db.users?.count === "function"
              ? db.users.count()
              : Promise.resolve(null),

          typeof db.threads?.countDocuments === "function"
            ? db.threads.countDocuments()
            : typeof db.threads?.count === "function"
              ? db.threads.count()
              : Promise.resolve(null)
        ]);

        if (userCount !== null) users = userCount;
        if (groupCount !== null) groups = groupCount;
      }
    } catch (error) {
      console.error("[UPTIME] Database error:", error.message);
    }

    const ram = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

    const body = [
      "╭───〔 BOT STATUS 〕",
      `│ ⏱ Uptime: ${uptime}`,
      `│ 👥 Groups: ${groups}`,
      `│ 👤 Users: ${users}`,
      `│ 💾 RAM: ${ram} MB`,
      "╰────────────────"
    ].join("\n");

    if (message && typeof message.reply === "function") {
      return message.reply(body);
    }

    if (message && typeof message.send === "function") {
      return message.send({ body });
    }

    if (api && typeof api.sendMessage === "function") {
      console.warn("[UPTIME] Could not find message reply/send method.");
    }
  }
};
