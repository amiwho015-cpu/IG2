/**
 * File Name: getBotInfo.js
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
 * getBotInfo
 *
 * Return the logged-in account's own profile (id, name, avatar url, ...).
 *
 * @param {(err, info) => void} [callback]
 * @returns {object}
 *
 * Example:
 *   api.getBotInfo();
 */
module.exports = {
        name: "getBotInfo",
        kind: "engine",
        args: [
        {
                "name": "callback",
                "type": "(err, info) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "object",
        doc: "Return the logged-in account's own profile (id, name, avatar url, ...)."
};
