/**
 * File Name: setTitle.js
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
 * setTitle
 *
 * Rename a group thread.
 *
 * @param {string} newTitle - New group name.
 * @param {string | number} threadID
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.setTitle(newTitle, threadID, ...);
 */
module.exports = {
        name: "setTitle",
        kind: "engine",
        args: [
        {
                "name": "newTitle",
                "type": "string",
                "optional": false,
                "description": "New group name."
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
        doc: "Rename a group thread."
};
