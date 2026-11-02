/**
 * File Name: markAsSeen.js
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
 * markAsSeen
 *
 * Mark a thread as seen.
 *
 * @param {string | number} threadID
 * @param {string} [messageID]
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.markAsSeen(threadID, ...);
 */
module.exports = {
        name: "markAsSeen",
        kind: "engine",
        args: [
        {
                "name": "threadID",
                "type": "string | number",
                "optional": false,
                "description": ""
        },
        {
                "name": "messageID",
                "type": "string",
                "optional": true,
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
        doc: "Mark a thread as seen."
};
