/**
 * File Name: getFriendsList.js
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
 * getFriendsList
 *
 * List the account's (or a user's) friends/followers.
 *
 * @param {string} [userID] - Defaults to the logged-in account.
 * @param {(err, friends) => void} [callback]
 * @returns {unknown[]}
 *
 * Example:
 *   api.getFriendsList();
 */
module.exports = {
        name: "getFriendsList",
        kind: "engine",
        args: [
        {
                "name": "userID",
                "type": "string",
                "optional": true,
                "description": "Defaults to the logged-in account."
        },
        {
                "name": "callback",
                "type": "(err, friends) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown[]",
        doc: "List the account's (or a user's) friends/followers."
};
