"use strict";

// IG2-native song command. Do not call Tanvir ICA-only searchMusic/sendVoice:
// this project uses the shared YouTube search/downloader and normal attachment send.
module.exports = require("../src/songCommand")({
    name: "song",
    aliases: ["play", "audio"],
    order: ["api", "ytdl", "yta2", "ytaudio"]
});
