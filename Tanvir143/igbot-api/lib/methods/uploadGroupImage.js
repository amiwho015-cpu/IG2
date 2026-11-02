/**
 * File Name: uploadGroupImage.js
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
 * uploadGroupImage
 *
 * Upload a group image and return its URL.
 *
 * @param {Buffer | stream | string} image - Buffer, stream, path or URL.
 * @param {(err, url?) => void} [callback]
 * @returns {string}
 *
 * Example:
 *   api.uploadGroupImage(image, ...);
 */
module.exports = {
        name: "uploadGroupImage",
        kind: "engine",
        args: [
        {
                "name": "image",
                "type": "Buffer | stream | string",
                "optional": false,
                "description": "Buffer, stream, path or URL."
        },
        {
                "name": "callback",
                "type": "(err, url?) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "string",
        doc: "Upload a group image and return its URL."
};
