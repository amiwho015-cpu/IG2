/**
 * File Name: editMessage.js
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
 * editMessage
 *
 * Edit the text of a message you sent.
 *
 * @param {string} text - New body text.
 * @param {string} messageID - The message to edit.
 * @param {(err) => void} [callback]
 * @param {string} [threadID] - Optional thread id if it cannot be resolved.
 * @returns {unknown}
 *
 * Example:
 *   api.editMessage(text, messageID, ...);
 */
module.exports = {
        name: "editMessage",
        kind: "engine",
        args: [
        {
                "name": "text",
                "type": "string",
                "optional": false,
                "description": "New body text."
        },
        {
                "name": "messageID",
                "type": "string",
                "optional": false,
                "description": "The message to edit."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        },
        {
                "name": "threadID",
                "type": "string",
                "optional": true,
                "description": "Optional thread id if it cannot be resolved."
        }
],
        returns: "unknown",
        doc: "Edit the text of a message you sent."
};
