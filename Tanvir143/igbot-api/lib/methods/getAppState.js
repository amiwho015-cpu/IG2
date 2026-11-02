/**
 * File Name: getAppState.js
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
 * getAppState
 *
 * Return the session cookies as an appState array.
 *
 * @param {(err, cookies) => void} [callback]
 * @returns {AppStateCookie[]}
 *
 * Example:
 *   api.getAppState();
 */
module.exports = {
        name: "getAppState",
        kind: "engine",
        args: [
        {
                "name": "callback",
                "type": "(err, cookies) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "AppStateCookie[]",
        doc: "Return the session cookies as an appState array."
};
