/**
 * File Name: searchMusic.js
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
 * searchMusic
 *
 * Search the music catalog.
 *
 * @param {string} query - Search text.
 * @param {(err, results) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.searchMusic(query, ...);
 */
module.exports = {
        name: "searchMusic",
        kind: "engine",
        args: [
        {
                "name": "query",
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
        returns: "unknown",
        doc: "Search the music catalog."
};
