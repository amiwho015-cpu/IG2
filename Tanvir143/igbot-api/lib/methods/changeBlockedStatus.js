/**
 * File Name: changeBlockedStatus.js
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
 * changeBlockedStatus
 *
 * Block or unblock a user.
 *
 * @param {string} userID
 * @param {boolean} [block] - true to block, false to unblock.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.changeBlockedStatus(userID, ...);
 */
module.exports = {
        name: "changeBlockedStatus",
        kind: "engine",
        args: [
        {
                "name": "userID",
                "type": "string",
                "optional": false,
                "description": ""
        },
        {
                "name": "block",
                "type": "boolean",
                "optional": true,
                "description": "true to block, false to unblock."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Block or unblock a user."
};
