/**
 * File Name: markAsReadAll.js
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
 * markAsReadAll
 *
 * Mark every unread thread as read.
 *
 * @param {(err, res) => void} [callback]
 * @returns {unknown[]}
 *
 * Example:
 *   api.markAsReadAll();
 */
module.exports = {
        name: "markAsReadAll",
        kind: "engine",
        args: [
        {
                "name": "callback",
                "type": "(err, res) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown[]",
        doc: "Mark every unread thread as read."
};
