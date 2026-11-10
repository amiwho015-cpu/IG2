"use strict";

const { createFrameCommand } = require("../src/frameCard");

const command = createFrameCommand({ name: "cheater", family: "cheater", variant: 1 });
command.config.aliases = ["dhoka"];
module.exports = command;
