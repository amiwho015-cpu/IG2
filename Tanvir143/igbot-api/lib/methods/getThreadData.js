/**
 * File Name: getThreadData.js
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
 * getThreadData
 *
 * Return the raw server-side thread object.
 *
 * @param {string | number} threadID
 * @param {(err, data) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.getThreadData(threadID, ...);
 */
module.exports = {
        name: "getThreadData",
        kind: "engine",
        args: [
        {
                "name": "threadID",
                "type": "string | number",
                "optional": false,
                "description": ""
        },
        {
                "name": "callback",
                "type": "(err, data) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Return the raw server-side thread object."
};
