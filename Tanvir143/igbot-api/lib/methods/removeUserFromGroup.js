/**
 * File Name: removeUserFromGroup.js
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
 * removeUserFromGroup
 *
 * Remove one or more users from a group thread.
 *
 * @param {string | string[]} userID
 * @param {string | number} threadID
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.removeUserFromGroup(userID, threadID, ...);
 */
module.exports = {
        name: "removeUserFromGroup",
        kind: "engine",
        args: [
        {
                "name": "userID",
                "type": "string | string[]",
                "optional": false,
                "description": ""
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
        doc: "Remove one or more users from a group thread."
};
