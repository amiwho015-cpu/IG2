/**
 * File Name: isChallenged.js
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
 * isChallenged
 *
 * True while Instagram is holding the session behind a challenge/checkpoint.
 * Synchronous on the server.
 *
 * (no arguments)
 * @returns {boolean}
 *
 * Example:
 *   api.isChallenged();
 */
module.exports = {
        name: "isChallenged",
        kind: "engine",
        args: [],
        returns: "boolean",
        doc: "True while Instagram is holding the session behind a challenge/checkpoint. Synchronous on the server."
};
