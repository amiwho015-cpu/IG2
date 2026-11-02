/**
 * File Name: getEmojiUrl.js
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
 * getEmojiUrl
 *
 * Build a Twemoji image URL for an emoji string.
 * Synchronous.
 * Synchronous: answered from the login manifest. No callback, no round trip.
 *
 * @param {string} c
 * @param {number} [size]
 * @param {number} [pixelRatio]
 * @returns {string}
 *
 * Example:
 *   api.getEmojiUrl(c, ...);
 */
module.exports = {
        name: "getEmojiUrl",
        kind: "sync",
        args: [
        {
                "name": "c",
                "type": "string",
                "optional": false,
                "description": ""
        },
        {
                "name": "size",
                "type": "number",
                "optional": true,
                "description": ""
        },
        {
                "name": "pixelRatio",
                "type": "number",
                "optional": true,
                "description": ""
        }
],
        returns: "string",
        doc: "Build a Twemoji image URL for an emoji string. Synchronous."
};
