"use strict";
// Reply to a photo: -mjedit <change>. Logic in src/aiEdit.js (endpoint is a guess, see there).
module.exports = require("../src/aiEdit").make("mjedit", "midjourney", "Midjourney");
