"use strict";
// Direct YouTube download first, API mirrors as the backup (the opposite of sing).
module.exports = require("../src/songCommand")({ name: "sing2", aliases: [], order: ["ytdl", "api", "yta2", "ytaudio"] });
