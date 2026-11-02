/**
 * File Name: forwardAttachment.js
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
 * forwardAttachment
 *
 * Forward an already-uploaded attachment to another thread.
 *
 * @param {string} attachmentID - Id returned by uploadAttachment.
 * @param {string | number} threadID - Destination thread.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.forwardAttachment(attachmentID, threadID, ...);
 */
module.exports = {
        name: "forwardAttachment",
        kind: "engine",
        args: [
        {
                "name": "attachmentID",
                "type": "string",
                "optional": false,
                "description": "Id returned by uploadAttachment."
        },
        {
                "name": "threadID",
                "type": "string | number",
                "optional": false,
                "description": "Destination thread."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Forward an already-uploaded attachment to another thread."
};
