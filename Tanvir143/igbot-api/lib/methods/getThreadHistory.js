/**
 * File Name: getThreadHistory.js
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
 * getThreadHistory
 *
 * Return the last `amount` messages of a thread (oldest first).
 *
 * @param {string | number} threadID - Thread to read.
 * @param {number} [amount] - Number of messages to return.
 * @param {string | null} [timestamp]
 * @param {(err, messages) => void} [callback]
 * @returns {Message[]}
 *
 * Example:
 *   api.getThreadHistory(threadID, ...);
 */
module.exports = {
        name: "getThreadHistory",
        kind: "engine",
        args: [
        {
                "name": "threadID",
                "type": "string | number",
                "optional": false,
                "description": "Thread to read."
        },
        {
                "name": "amount",
                "type": "number",
                "optional": true,
                "description": "Number of messages to return."
        },
        {
                "name": "timestamp",
                "type": "string | null",
                "optional": true,
                "description": ""
        },
        {
                "name": "callback",
                "type": "(err, messages) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "Message[]",
        doc: "Return the last `amount` messages of a thread (oldest first)."
};
