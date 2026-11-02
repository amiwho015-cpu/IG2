/**
 * File Name: getMessage.js
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
 * getMessage
 *
 * Fetch a single message by id.
 *
 * @param {string} messageID - The message id.
 * @param {(err, message) => void} [callback]
 * @returns {Message}
 *
 * Example:
 *   api.getMessage(messageID, ...);
 */
module.exports = {
        name: "getMessage",
        kind: "engine",
        args: [
        {
                "name": "messageID",
                "type": "string",
                "optional": false,
                "description": "The message id."
        },
        {
                "name": "callback",
                "type": "(err, message) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "Message",
        doc: "Fetch a single message by id."
};
