/**
 * File Name: getIGUserInfo.js
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
 * getIGUserInfo
 *
 * Look up a single Instagram user by id.
 * Alias of getUserInfo for one id.
 *
 * @param {string} id
 * @param {(err, info) => void} [callback]
 * @returns {User | null}
 *
 * Example:
 *   api.getIGUserInfo(id, ...);
 */
module.exports = {
        name: "getIGUserInfo",
        kind: "engine",
        args: [
        {
                "name": "id",
                "type": "string",
                "optional": false,
                "description": ""
        },
        {
                "name": "callback",
                "type": "(err, info) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "User | null",
        doc: "Look up a single Instagram user by id. Alias of getUserInfo for one id."
};
