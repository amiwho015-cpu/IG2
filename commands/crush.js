"use strict";

const { createFrameCommand } = require("../src/frameCard");

const command = createFrameCommand({ name: "crush", family: "crush", variant: 1 });
command.config.aliases = ["crush2"];
module.exports = command;
