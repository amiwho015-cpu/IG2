/**
 * File Name: getThreadMedia.js
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
 * getThreadMedia
 *
 * List media shared in a thread (photos/videos/voice).
 *
 * @param {string | number} threadID
 * @param {object} [options]
 * @param {(err, media) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.getThreadMedia(threadID, ...);
 */
module.exports = {
        name: "getThreadMedia",
        kind: "engine",
        args: [
        {
                "name": "threadID",
                "type": "string | number",
                "optional": false,
                "description": ""
        },
        {
                "name": "options",
                "type": "object",
                "optional": true,
                "description": ""
        },
        {
                "name": "callback",
                "type": "(err, media) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "List media shared in a thread (photos/videos/voice)."
};
