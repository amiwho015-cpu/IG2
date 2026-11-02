/**
 * File Name: sendMusicSticker.js
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
 * sendMusicSticker
 *
 * Send a music sticker.
 * Pass the audio asset id from searchMusic.
 *
 * @param {{ audioAssetId, text? } | string} music - { audioAssetId, text? } or the asset id string.
 * @param {string | number} threadID
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.sendMusicSticker(music, threadID, ...);
 */
module.exports = {
        name: "sendMusicSticker",
        kind: "engine",
        args: [
        {
                "name": "music",
                "type": "{ audioAssetId, text? } | string",
                "optional": false,
                "description": "{ audioAssetId, text? } or the asset id string."
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
        doc: "Send a music sticker. Pass the audio asset id from searchMusic."
};
