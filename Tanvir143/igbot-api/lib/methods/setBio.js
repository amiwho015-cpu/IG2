/**
 * File Name: setBio.js
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
 * setBio
 *
 * Alias of changeBio.
 *
 * @param {string} bio
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.setBio(bio, ...);
 */
module.exports = {
        name: "setBio",
        kind: "engine",
        args: [
        {
                "name": "bio",
                "type": "string",
                "optional": false,
                "description": ""
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Alias of changeBio."
};
