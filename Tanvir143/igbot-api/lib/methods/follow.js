/**
 * File Name: follow.js
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
 * follow
 *
 * Follow a user.
 *
 * @param {string} userID - User to follow.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.follow(userID, ...);
 */
module.exports = {
        name: "follow",
        kind: "engine",
        args: [
        {
                "name": "userID",
                "type": "string",
                "optional": false,
                "description": "User to follow."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Follow a user."
};
