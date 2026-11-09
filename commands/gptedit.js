"use strict";
// Reply to a photo: -gptedit <change>. Logic in src/aiEdit.js (endpoint is a guess, see there).
module.exports = require("../src/aiEdit").make("gptedit", "gpt", "GPT");
