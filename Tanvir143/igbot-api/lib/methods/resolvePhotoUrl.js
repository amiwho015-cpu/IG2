/**
 * File Name: resolvePhotoUrl.js
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
 * resolvePhotoUrl
 *
 * Resolve a media id or URL to a usable photo URL (pass-through for URLs).
 *
 * @param {string} value - Media id or URL (URLs pass through).
 * @param {(err, url) => void} [callback]
 * @returns {string}
 *
 * Example:
 *   api.resolvePhotoUrl(value, ...);
 */
module.exports = {
        name: "resolvePhotoUrl",
        kind: "engine",
        args: [
        {
                "name": "value",
                "type": "string",
                "optional": false,
                "description": "Media id or URL (URLs pass through)."
        },
        {
                "name": "callback",
                "type": "(err, url) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "string",
        doc: "Resolve a media id or URL to a usable photo URL (pass-through for URLs)."
};
