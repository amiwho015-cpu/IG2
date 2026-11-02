/**
 * File Name: getProfileInfo.js
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
 * getProfileInfo
 *
 * Fetch a full profile by numeric id or username.
 *
 * @param {string} idOrUsername - Numeric id or username.
 * @param {(err, info) => void} [callback]
 * @returns {object}
 *
 * Example:
 *   api.getProfileInfo(idOrUsername, ...);
 */
module.exports = {
        name: "getProfileInfo",
        kind: "engine",
        args: [
        {
                "name": "idOrUsername",
                "type": "string",
                "optional": false,
                "description": "Numeric id or username."
        },
        {
                "name": "callback",
                "type": "(err, info) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "object",
        doc: "Fetch a full profile by numeric id or username."
};
