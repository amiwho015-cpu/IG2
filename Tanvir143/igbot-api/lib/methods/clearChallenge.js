/**
 * File Name: clearChallenge.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

/*
 * @lazyneoaz/ig-chat-api
 * Author: Saifullah Al Neoaz
 * GitHub: https://github.com/lazyneoaz
 */
"use strict";

/**
 * clearChallenge
 *
 * Reset the challenge latch after clearing it in a browser.
 * Synchronous on the server.
 *
 * (no arguments)
 * @returns {{ ok: true }}
 *
 * Example:
 *   api.clearChallenge();
 */
module.exports = {
        name: "clearChallenge",
        kind: "engine",
        args: [],
        returns: "{ ok: true }",
        doc: "Reset the challenge latch after clearing it in a browser. Synchronous on the server."
};
