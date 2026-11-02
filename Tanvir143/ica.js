/**
 * File Name: ica.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

/**
 * Single integration point between the bot and its local ICA package.
 * If the ICA package name or entry point changes, update this adapter first.
 * Bot commands/events should use the API instance supplied by the bot context.
 */
const login = require("igbot-api");

module.exports = Object.freeze({
  login: login.login || login.connect || login,
  packageName: "igbot-api"
});
