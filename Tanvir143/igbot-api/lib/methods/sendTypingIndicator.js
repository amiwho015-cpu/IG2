/**
 * File Name: sendTypingIndicator.js
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
 * sendTypingIndicator
 *
 * Show or clear the typing indicator in a thread.
 * `isTyping` defaults to true.
 *
 * @param {string | number} threadID
 * @param {boolean} [isTyping] - true to show typing, false to clear (default true).
 * @param {() => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.sendTypingIndicator(threadID, ...);
 */
module.exports = {
        name: "sendTypingIndicator",
        kind: "engine",
        args: [
        {
                "name": "threadID",
                "type": "string | number",
                "optional": false,
                "description": ""
        },
        {
                "name": "isTyping",
                "type": "boolean",
                "optional": true,
                "description": "true to show typing, false to clear (default true)."
        },
        {
                "name": "callback",
                "type": "() => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Show or clear the typing indicator in a thread. `isTyping` defaults to true."
};
