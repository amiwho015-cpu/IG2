/**
 * File Name: createPoll.js
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
 * createPoll
 *
 * Create a poll in a thread.
 *
 * @param {string} title
 * @param {string | number} threadID
 * @param {string[]} options - Poll choices.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.createPoll(title, threadID, options, ...);
 */
module.exports = {
        name: "createPoll",
        kind: "engine",
        args: [
        {
                "name": "title",
                "type": "string",
                "optional": false,
                "description": ""
        },
        {
                "name": "threadID",
                "type": "string | number",
                "optional": false,
                "description": ""
        },
        {
                "name": "options",
                "type": "string[]",
                "optional": false,
                "description": "Poll choices."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Create a poll in a thread."
};
