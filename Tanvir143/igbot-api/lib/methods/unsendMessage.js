/**
 * File Name: unsendMessage.js
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
 * unsendMessage
 *
 * Unsend (delete for everyone) a message you sent.
 * No threadID is required; it is resolved from the server-side cache or a `"<threadID>:<itemID>"` id.
 *
 * @param {string} messageID - Message id, or "<threadID>:<itemID>".
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.unsendMessage(messageID, ...);
 */
module.exports = {
        name: "unsendMessage",
        kind: "engine",
        args: [
        {
                "name": "messageID",
                "type": "string",
                "optional": false,
                "description": "Message id, or \"<threadID>:<itemID>\"."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Unsend (delete for everyone) a message you sent. No threadID is required; it is resolved from the server-side cache or a `\"<threadID>:<itemID>\"` id."
};
