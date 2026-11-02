/**
 * File Name: deleteMessage.js
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
 * deleteMessage
 *
 * Delete one or more messages.
 *
 * @param {string | string[]} messageOrMessages - One message id or an array.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.deleteMessage(messageOrMessages, ...);
 */
module.exports = {
        name: "deleteMessage",
        kind: "engine",
        args: [
        {
                "name": "messageOrMessages",
                "type": "string | string[]",
                "optional": false,
                "description": "One message id or an array."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Delete one or more messages."
};
