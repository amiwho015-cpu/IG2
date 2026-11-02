/**
 * File Name: unfollow.js
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
 * unfollow
 *
 * Unfollow a user.
 *
 * @param {string} userID - User to unfollow.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.unfollow(userID, ...);
 */
module.exports = {
        name: "unfollow",
        kind: "engine",
        args: [
        {
                "name": "userID",
                "type": "string",
                "optional": false,
                "description": "User to unfollow."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Unfollow a user."
};
