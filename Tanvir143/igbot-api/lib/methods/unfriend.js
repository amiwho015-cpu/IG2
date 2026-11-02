/**
 * File Name: unfriend.js
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
 * unfriend
 *
 * Remove a follower/relationship.
 *
 * @param {string} userID
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.unfriend(userID, ...);
 */
module.exports = {
        name: "unfriend",
        kind: "engine",
        args: [
        {
                "name": "userID",
                "type": "string",
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
        doc: "Remove a follower/relationship."
};
