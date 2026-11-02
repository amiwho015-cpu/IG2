/**
 * File Name: getListenerOptions.js
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
 * getListenerOptions
 *
 * Read the sanitized realtime options stored for this session.
 * Server-level setting (not an Instagram api method).
 *
 * @param {(err, res) => void} [callback] - Receives { options }.
 * @returns {{ options: LoginOptions }}
 *
 * Example:
 *   api.getListenerOptions();
 */
module.exports = {
        name: "getListenerOptions",
        kind: "server",
        args: [
        {
                "name": "callback",
                "type": "(err, res) => void",
                "optional": true,
                "description": "Receives { options }."
        }
],
        returns: "{ options: LoginOptions }",
        doc: "Read the sanitized realtime options stored for this session."
};
