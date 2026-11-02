/**
 * File Name: getThreadInfo.js
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
 * getThreadInfo
 *
 * Fetch metadata (name, participants, image, admin ids, ...) for a thread or a list of threads.
 *
 * @param {string | number | string[]} threadID - One thread id, or an array of ids.
 * @param {(err, info) => void} [callback]
 * @param {boolean} [full] - Include the raw server object.
 * @returns {Thread}
 *
 * Example:
 *   api.getThreadInfo(threadID, ...);
 */
module.exports = {
        name: "getThreadInfo",
        kind: "engine",
        args: [
        {
                "name": "threadID",
                "type": "string | number | string[]",
                "optional": false,
                "description": "One thread id, or an array of ids."
        },
        {
                "name": "callback",
                "type": "(err, info) => void",
                "optional": true,
                "description": ""
        },
        {
                "name": "full",
                "type": "boolean",
                "optional": true,
                "description": "Include the raw server object."
        }
],
        returns: "Thread",
        doc: "Fetch metadata (name, participants, image, admin ids, ...) for a thread or a list of threads."
};
