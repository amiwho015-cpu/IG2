/**
 * File Name: changeAvatar.js
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
 * changeAvatar
 *
 * Change the profile picture (with an optional story caption/expiry).
 *
 * @param {Buffer | stream | string} image - Buffer, stream, path or URL.
 * @param {string} [caption] - Optional story caption.
 * @param {number} [expirationAfter] - Story expiry in ms.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.changeAvatar(image, ...);
 */
module.exports = {
        name: "changeAvatar",
        kind: "engine",
        args: [
        {
                "name": "image",
                "type": "Buffer | stream | string",
                "optional": false,
                "description": "Buffer, stream, path or URL."
        },
        {
                "name": "caption",
                "type": "string",
                "optional": true,
                "description": "Optional story caption."
        },
        {
                "name": "expirationAfter",
                "type": "number",
                "optional": true,
                "description": "Story expiry in ms."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Change the profile picture (with an optional story caption/expiry)."
};
