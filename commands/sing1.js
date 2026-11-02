"use strict";
// API mirrors first, direct YouTube download as the backup.
module.exports = require("../src/songCommand")({ name: "sing1", aliases: [], order: ["api", "ytdl", "yta2", "ytaudio"] });
