/**
 * File Name: getUserInfo.js
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
 * getUserInfo
 *
 * Look up one or more users by id (or fbid).
 * Returns a map keyed by id.
 *
 * @param {string | string[]} id - One user id/fbid, or an array.
 * @param {(err, info) => void} [callback]
 * @returns {Record<string, User>}
 *
 * Example:
 *   api.getUserInfo(id, ...);
 */
module.exports = {
        name: "getUserInfo",
        kind: "engine",
        args: [
        {
                "name": "id",
                "type": "string | string[]",
                "optional": false,
                "description": "One user id/fbid, or an array."
        },
        {
                "name": "callback",
                "type": "(err, info) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "Record<string, User>",
        doc: "Look up one or more users by id (or fbid). Returns a map keyed by id."
};
