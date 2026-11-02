/**
 * File Name: searchForThread.js
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
 * searchForThread
 *
 * Search threads and users by name.
 *
 * @param {string} name - Search text.
 * @param {(err, results) => void} [callback]
 * @returns {unknown[]}
 *
 * Example:
 *   api.searchForThread(name, ...);
 */
module.exports = {
        name: "searchForThread",
        kind: "engine",
        args: [
        {
                "name": "name",
                "type": "string",
                "optional": false,
                "description": "Search text."
        },
        {
                "name": "callback",
                "type": "(err, results) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown[]",
        doc: "Search threads and users by name."
};
