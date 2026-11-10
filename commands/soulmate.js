"use strict";

const { createFrameCommand } = require("../src/frameCard");

const command = createFrameCommand({ name: "soulmate", family: "soulmate", variant: 1 });
command.config.aliases = ["soul"];
module.exports = command;
