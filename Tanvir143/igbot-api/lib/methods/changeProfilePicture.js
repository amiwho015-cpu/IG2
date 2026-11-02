/**
 * File Name: changeProfilePicture.js
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
 * changeProfilePicture
 *
 * Alias of changeAvatar.
 *
 * @param {Buffer | stream | string} image
 * @param {string} [caption]
 * @param {number} [expirationAfter]
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.changeProfilePicture(image, ...);
 */
module.exports = {
        name: "changeProfilePicture",
        kind: "engine",
        args: [
        {
                "name": "image",
                "type": "Buffer | stream | string",
                "optional": false,
                "description": ""
        },
        {
                "name": "caption",
                "type": "string",
                "optional": true,
                "description": ""
        },
        {
                "name": "expirationAfter",
                "type": "number",
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
        doc: "Alias of changeAvatar."
};
