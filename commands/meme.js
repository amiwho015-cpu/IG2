const axios = require("axios");
const tz = require("../src/toshiro");

const QUERIES = ["funny meme", "bangla funny meme", "bengali meme", "dank memes", "relatable memes", "funny memes bangla"];

// old source, kept only as a backup when Pinterest gives nothing
const mahmud = async () => {
  const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/exe/main/baseApiUrl.json", { timeout: 15000 });
  return base.data.mahmud;
};

async function fromBackup() {
  const apiUrl = await mahmud();
  const res = await axios.get(`${apiUrl}/api/meme`, { timeout: 20000 });
  const imageUrl = res.data?.imageUrl;
  if (!imageUrl) throw new Error("no meme from the backup source");
  const img = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 30000, headers: { "User-Agent": "Mozilla/5.0" } });
  return { buffer: Buffer.from(img.data), ext: "jpg" };
}

module.exports = {
  config: {
    name: "meme",
    aliases: ["memes"],
    version: "2.0",
    author: "MahMUD",
    countDown: 10,
    role: 0,
    category: "fun",
    guide: "{pn}   → random meme from Pinterest\n{pn} <topic>   → meme about the topic"
  },

  onStart: async function ({ message, args }) {
    const topic = args.join(" ").trim();
    const query = topic ? `${topic} meme` : QUERIES[Math.floor(Math.random() * QUERIES.length)];
    let image;
    let reason = "";
    try { [image] = await tz.fetchImages("/api/search/pin", query, { count: 1 }); }
    catch (e) { reason = (e && e.message) || String(e); }
    if (!image) {
      try { image = await fromBackup(); }
      catch (e) { return message.reply(`❌ Could not fetch a meme: ${reason || (e && e.message) || "try again"}`.slice(0, 220)); }
    }
    return message.reply({
      attachment: { buffer: image.buffer, fileName: `meme.${image.ext}` }
    });
  }
};
