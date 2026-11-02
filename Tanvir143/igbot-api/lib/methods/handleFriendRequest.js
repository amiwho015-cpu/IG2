/**
 * File Name: handleFriendRequest.js
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
 * handleFriendRequest
 *
 * Accept or decline a follow request.
 *
 * @param {string} userID
 * @param {boolean} [accept] - true to accept, false to decline.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.handleFriendRequest(userID, ...);
 */
module.exports = {
        name: "handleFriendRequest",
        kind: "engine",
        args: [
        {
                "name": "userID",
                "type": "string",
                "optional": false,
                "description": ""
        },
        {
                "name": "accept",
                "type": "boolean",
                "optional": true,
                "description": "true to accept, false to decline."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Accept or decline a follow request."
};
