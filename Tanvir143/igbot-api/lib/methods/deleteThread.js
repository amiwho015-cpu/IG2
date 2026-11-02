/**
 * File Name: deleteThread.js
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
 * deleteThread
 *
 * Delete (leave) one or more threads.
 *
 * @param {string | number | Array} threadOrThreads - One thread id or an array.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.deleteThread(threadOrThreads, ...);
 */
module.exports = {
        name: "deleteThread",
        kind: "engine",
        args: [
        {
                "name": "threadOrThreads",
                "type": "string | number | Array",
                "optional": false,
                "description": "One thread id or an array."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Delete (leave) one or more threads."
};
