/**
 * File Name: changeBio.js
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
 * changeBio
 *
 * Change the account bio.
 *
 * @param {string} bio - New bio text.
 * @param {boolean} [publish] - Also publish to the profile feed.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.changeBio(bio, ...);
 */
module.exports = {
        name: "changeBio",
        kind: "engine",
        args: [
        {
                "name": "bio",
                "type": "string",
                "optional": false,
                "description": "New bio text."
        },
        {
                "name": "publish",
                "type": "boolean",
                "optional": true,
                "description": "Also publish to the profile feed."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Change the account bio."
};
