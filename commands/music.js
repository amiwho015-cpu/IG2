/**
 * File Name: music.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

function normalizeTracks(result) {
  const items = Array.isArray(result) ? result
    : Array.isArray(result?.items) ? result.items
    : Array.isArray(result?.tracks) ? result.tracks
    : Array.isArray(result?.results) ? result.results
    : Array.isArray(result?.data?.items) ? result.data.items
    : Array.isArray(result?.data?.tracks) ? result.data.tracks
    : Array.isArray(result?.data) ? result.data : [];
  return items.map(item => item?.track || item?.original_sound || item).filter(Boolean);
}

function findBestTrack(result, query) {
  const tracks = normalizeTracks(result);
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const nq = norm(query);
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let best = null, bestScore = -1;

  for (const t of tracks) {
    const id = t.audio_cluster_id || t.audioClusterId || t.audioClusterID;
    const title = t.title || t.canonical_title || t.name || query;
    if (!id) continue;
    const nt = norm(title);
    let score = nt === nq ? 100 : nt.includes(nq) ? 50 : 0;
    for (const token of tokens) if (nt.includes(token)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = { id, title };
    }
  }
  return best;
}

module.exports = {
  config: {
    name: "music",
    aliases: ["musics", "musicsticker", "sm"],
    author: "Neoaz 🐊",
    category: "Users Cmd",
    cooldown: 5,
    role: 0,
    description: { en: "Send an Instagram native music sticker" },
    usage: { en: "{p}music <song name>" }
  },

  onStart: async function ({ message, args }) {
    const query = args.join(" ").trim();
    if (!query) return message.reply("🎵 Song-er naam dao. Example: .music Faded");

    try {
      await message.react("⌛");
      const result = await message.musicSearch(query);
      console.log("[ICA MUSIC SEARCH]", JSON.stringify(result, null, 2));

      const track = findBestTrack(result, query);
      if (!track) {
        await message.react("❌");
        return message.reply('❌ "' + query + '" er kono usable audio cluster ID paoa jayni.');
      }

      await message.music(track.id);
      await message.react("✅");
    } catch (error) {
      console.error("[MUSIC ERROR]", error);
      try { await message.react("❌"); } catch (_) {}
      return message.reply("❌ Music sticker pathano jayni.\n📝 " + String(error?.message || error));
    }
  }
};
