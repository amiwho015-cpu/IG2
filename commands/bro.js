"use strict";

const { createFrameCommand } = require("../src/frameCard");

const command = createFrameCommand({ name: "bro", family: "bro", variant: 1 });
command.config.aliases = ["bhai"];
module.exports = command;
