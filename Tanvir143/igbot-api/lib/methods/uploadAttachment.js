/**
 * File Name: uploadAttachment.js
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
 * uploadAttachment
 *
 * Pre-upload media and receive the ids sendMessage can reference.
 * The client uploads the bytes to the server first.
 *
 * @param {Buffer | stream | Array} attachments - Buffer, readable stream or file path (uploaded first).
 * @param {(err, res) => void} [callback]
 * @returns {Array<{ media_id }>}
 *
 * Example:
 *   api.uploadAttachment(attachments, ...);
 */
module.exports = {
        name: "uploadAttachment",
        kind: "engine",
        args: [
        {
                "name": "attachments",
                "type": "Buffer | stream | Array",
                "optional": false,
                "description": "Buffer, readable stream or file path (uploaded first)."
        },
        {
                "name": "callback",
                "type": "(err, res) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "Array<{ media_id }>",
        doc: "Pre-upload media and receive the ids sendMessage can reference. The client uploads the bytes to the server first."
};
