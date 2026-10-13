const axios = require("axios");

const API_CONFIG_URL = "https://raw.githubusercontent.com/goatbotnx/xalmanx210/refs/heads/main/apis.json";
const API_KEY = "xalman-hub";
let apiBaseUrl = null;
let apiConfigRequest = null;

async function getApiBaseUrl() {
  if (apiBaseUrl) return apiBaseUrl;

  if (!apiConfigRequest) {
    apiConfigRequest = axios
      .get(API_CONFIG_URL, { timeout: 15000 })
      .then(({ data }) => {
        const baseUrl = data?.[API_KEY];

        if (typeof baseUrl !== "string" || !baseUrl.trim()) {
          throw new Error(`Missing API key in apis.json: ${API_KEY}`);
        }

        apiBaseUrl = baseUrl.replace(/\/+$/, "");
        return apiBaseUrl;
      })
      .finally(() => {
        apiConfigRequest = null;
      });
  }

  return apiConfigRequest;
}


// A bare axios stream has no file name, so the bot used to treat it as a PICTURE.
// Marking it with an .mp4 name makes it go out as a real video.
async function getVideoStream(url) {
  const res = await axios.get(url, {
    responseType: "stream",
    timeout: 60000,
    headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.tiktok.com/" }
  });
  const stream = res.data;
  stream.path = "tiktok.mp4";
  return stream;
}

module.exports = {
  config: {
    name: "tiktok",
    aliases: ["tik", "tt"],
    version: "1.2.0",
    author: "CRX Shihab",
    countDown: 10,
    role: 0,
    shortDescription: "Search and download TikTok videos with reply support",
    category: "MEDIA",
    guide: "{pn} [query] or {pn} [query] -list"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;

    if (args.length === 0) {
      return api.sendMessage("╭─❍\n│ Usage: {pn} [query]\n│ List: {pn} [query] -list\n╰───────────⟡", threadID, messageID);
    }

    const isList = args.includes("-list");
    const searchQuery = args.filter(arg => arg !== "-list").join(" ");

    if (!searchQuery) return api.sendMessage("✕ Please provide a search query!", threadID, messageID);

    api.setMessageReaction("🔍", messageID, () => {}, true);

    // Loading the API address used to sit OUTSIDE any try/catch: if it failed the command
    // just stayed silent. Now it retries and always answers.
    let API_URL;
    for (let attempt = 1; attempt <= 3 && !API_URL; attempt++) {
      try {
        API_URL = `${await getApiBaseUrl()}/api/tik`;
      } catch (e) {
        console.log(`[tiktok] could not load API address (try ${attempt}/3):`, e && e.message);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
      }
    }
    if (!API_URL) {
      api.setMessageReaction("❌", messageID, () => {}, true);
      return api.sendMessage("✕ TikTok API address could not be loaded. Try again in a moment.", threadID, messageID);
    }

    try {
      const res = await axios.get(`${API_URL}?q=${encodeURIComponent(searchQuery)}`, { timeout: 30000 });
      const results = res.data.results;

      if (!results || results.length === 0) {
        api.setMessageReaction("❌", messageID, () => {}, true);
        return api.sendMessage("✕ No videos found!", threadID, messageID);
      }

      if (isList) {
        let msg = `❖ 𝗧𝗜𝗞𝗧𝗢𝗞 𝗦𝗘𝗔𝗥𝗖𝗛 ❖\n━━━━━━━━━━━━━━━━━━\n`;
        let attachments = [];

        for (let i = 0; i < Math.min(6, results.length); i++) {
          msg += `${i + 1}. ${results[i].title}\n👤 Author: ${results[i].author}\n\n`;
          const thumbStream = (await axios.get(results[i].thumbnail, { responseType: 'stream' })).data;
          attachments.push(thumbStream);
        }

        msg += `━━━━━━━━━━━━━━━━━━\nReply with the number to download!`;
        api.setMessageReaction("📜", messageID, () => {}, true);

        return api.sendMessage({ body: msg, attachment: attachments }, threadID, (err, info) => {
          global.GoatBot.onReply.set(info.messageID, {
            commandName: this.config.name,
            messageID: info.messageID,
            author: event.senderID,
            results: results
          });
        }, messageID);
      }

      api.setMessageReaction("📥", messageID, () => {}, true);
      const videoStream = await getVideoStream(results[0].video_url);

      return api.sendMessage({
        attachment: videoStream
      }, threadID, messageID);

    } catch (error) {
      console.log("[tiktok] failed:", error && (error.message || error));
      api.setMessageReaction("❌", messageID, () => {}, true);
      return api.sendMessage("✕ API Error or Timeout!", threadID, messageID);
    }
  },

  onReply: async function ({ api, event, Reply, args }) {
    const { threadID, messageID, body, senderID } = event;
    const { results, author } = Reply;

    if (senderID !== author) return;

    const index = parseInt(body) - 1;
    if (isNaN(index) || index < 0 || index >= results.length) {
      return api.sendMessage("✕ Invalid selection!", threadID, messageID);
    }

    api.unsendMessage(Reply.messageID);
    api.setMessageReaction("📥", messageID, () => {}, true);

    try {
      const videoStream = await getVideoStream(results[index].video_url);
      return api.sendMessage({
        body: `❖ 𝗧𝗜𝗞𝗧𝗢𝗞 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 ❖\n━━━━━━━━━━━━━━━━━━\n📝 Title: ${results[index].title}`,
        attachment: videoStream
      }, threadID, messageID);
    } catch (error) {
      console.log("[tiktok] download failed:", error && (error.message || error));
      return api.sendMessage("✕ Failed to download video!", threadID, messageID);
    }
  }
};
