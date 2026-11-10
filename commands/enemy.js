"use strict";

const { createFrameCommand } = require("../src/frameCard");

const command = createFrameCommand({ name: "enemy", family: "enemy", variant: 1 });
command.config.aliases = ["dushman"];
module.exports = command;
