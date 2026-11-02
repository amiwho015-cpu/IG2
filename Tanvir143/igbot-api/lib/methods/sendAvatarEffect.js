/**
 * File Name: sendAvatarEffect.js
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
 * sendAvatarEffect
 *
 * Send an avatar power-up.
 * `avatar` is love|anger|laugh|cry (or an alias / "random").
 * Two shapes: `(avatar, message, threadID, cb)` or `({ avatar, body, threadID }, cb)`.
 *
 * @param {string | object} avatar - love|anger|laugh|cry, an alias, or "random".
 * @param {string} [message] - Accompanying body text.
 * @param {string | number} [threadID] - Destination thread.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.sendAvatarEffect(avatar, ...);
 */
module.exports = {
        name: "sendAvatarEffect",
        kind: "engine",
        args: [
        {
                "name": "avatar",
                "type": "string | object",
                "optional": false,
                "description": "love|anger|laugh|cry, an alias, or \"random\"."
        },
        {
                "name": "message",
                "type": "string",
                "optional": true,
                "description": "Accompanying body text."
        },
        {
                "name": "threadID",
                "type": "string | number",
                "optional": true,
                "description": "Destination thread."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Send an avatar power-up. `avatar` is love|anger|laugh|cry (or an alias / \"random\"). Two shapes: `(avatar, message, threadID, cb)` or `({ avatar, body, threadID }, cb)`."
};
