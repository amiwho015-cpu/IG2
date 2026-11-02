/**
 * File Name: getThreadPictures.js
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
 * getThreadPictures
 *
 * List images shared in a thread.
 *
 * @param {string | number} threadID
 * @param {number} [offset] - Paging offset.
 * @param {number} [limit] - Max images to return.
 * @param {(err, images) => void} [callback]
 * @returns {Array<{ url, ... }>}
 *
 * Example:
 *   api.getThreadPictures(threadID, ...);
 */
module.exports = {
        name: "getThreadPictures",
        kind: "engine",
        args: [
        {
                "name": "threadID",
                "type": "string | number",
                "optional": false,
                "description": ""
        },
        {
                "name": "offset",
                "type": "number",
                "optional": true,
                "description": "Paging offset."
        },
        {
                "name": "limit",
                "type": "number",
                "optional": true,
                "description": "Max images to return."
        },
        {
                "name": "callback",
                "type": "(err, images) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "Array<{ url, ... }>",
        doc: "List images shared in a thread."
};
