/**
 * File Name: markAsRead.js
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
 * markAsRead
 *
 * Mark a thread (or a message) as read.
 *
 * @param {string | number} threadID
 * @param {string} [messageID] - Optional specific message.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.markAsRead(threadID, ...);
 */
module.exports = {
        name: "markAsRead",
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
                "description": "Optional specific message."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Mark a thread (or a message) as read."
};
