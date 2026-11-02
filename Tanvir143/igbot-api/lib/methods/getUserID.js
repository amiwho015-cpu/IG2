/**
 * File Name: getUserID.js
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
 * getUserID
 *
 * Resolve a username to its numeric user id.
 *
 * @param {string} name - Instagram username (without @).
 * @param {(err, id) => void} [callback]
 * @returns {string}
 *
 * Example:
 *   api.getUserID(name, ...);
 */
module.exports = {
        name: "getUserID",
        kind: "engine",
        args: [
        {
                "name": "name",
                "type": "string",
                "optional": false,
                "description": "Instagram username (without @)."
        },
        {
                "name": "callback",
                "type": "(err, id) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "string",
        doc: "Resolve a username to its numeric user id."
};
