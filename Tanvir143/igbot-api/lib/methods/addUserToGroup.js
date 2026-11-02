/**
 * File Name: addUserToGroup.js
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
 * addUserToGroup
 *
 * Add one or more users to a group thread.
 *
 * @param {string | string[]} userID - One id or an array of ids.
 * @param {string | number} threadID
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.addUserToGroup(userID, threadID, ...);
 */
module.exports = {
        name: "addUserToGroup",
        kind: "engine",
        args: [
        {
                "name": "userID",
                "type": "string | string[]",
                "optional": false,
                "description": "One id or an array of ids."
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
        doc: "Add one or more users to a group thread."
};
