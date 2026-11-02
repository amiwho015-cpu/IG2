/**
 * File Name: changeGroupImage.js
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
 * changeGroupImage
 *
 * Set a group thread's image.
 * Accepts a Buffer/stream/path (uploaded first) or a URL.
 *
 * @param {Buffer | stream | string} image - Buffer, stream, path or URL (uploaded first if binary).
 * @param {string | number} threadID
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.changeGroupImage(image, threadID, ...);
 */
module.exports = {
        name: "changeGroupImage",
        kind: "engine",
        args: [
        {
                "name": "image",
                "type": "Buffer | stream | string",
                "optional": false,
                "description": "Buffer, stream, path or URL (uploaded first if binary)."
        },
        {
                "name": "threadID",
                "type": "string | number",
                "optional": false,
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
        doc: "Set a group thread's image. Accepts a Buffer/stream/path (uploaded first) or a URL."
};
