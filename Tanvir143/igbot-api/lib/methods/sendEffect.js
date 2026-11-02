/**
 * File Name: sendEffect.js
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
 * sendEffect
 *
 * Send a text power-up.
 * `effect` is a name (love/fire/...), a numeric style, or `{ style, text }`.
 *
 * @param {string | number | object} effect - Name (love/fire/...), numeric style, or { style, text }.
 * @param {string | number} threadID
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.sendEffect(effect, threadID, ...);
 */
module.exports = {
        name: "sendEffect",
        kind: "engine",
        args: [
        {
                "name": "effect",
                "type": "string | number | object",
                "optional": false,
                "description": "Name (love/fire/...), numeric style, or { style, text }."
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
        doc: "Send a text power-up. `effect` is a name (love/fire/...), a numeric style, or `{ style, text }`."
};
