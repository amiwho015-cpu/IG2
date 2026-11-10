"use strict";

const { createFrameCommand } = require("../src/frameCard");

const command = createFrameCommand({ name: "date", family: "date", variant: 1 });
command.config.aliases = ["dating"];
module.exports = command;
