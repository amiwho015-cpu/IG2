/**
 * File Name: setListenerOptions.js
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
 * setListenerOptions
 *
 * Turn realtime event types on/off for this session (listenEvents, selfListen, listenTyping, ...).
 * Stored on the session and applied to the live engine.
 * Engine-internal keys (proxy, dgwHost, userAgent, ...) are rejected.
 * Server-level setting (not an Instagram api method).
 *
 * @param {LoginOptions} options - Realtime options to change (listenEvents, selfListen, ...).
 * @param {(err, res) => void} [callback]
 * @returns {{ updated: string[] }}
 *
 * Example:
 *   api.setListenerOptions(options, ...);
 */
module.exports = {
        name: "setListenerOptions",
        kind: "server",
        args: [
        {
                "name": "options",
                "type": "LoginOptions",
                "optional": false,
                "description": "Realtime options to change (listenEvents, selfListen, ...)."
        },
        {
                "name": "callback",
                "type": "(err, res) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "{ updated: string[] }",
        doc: "Turn realtime event types on/off for this session (listenEvents, selfListen, listenTyping, ...). Stored on the session and applied to the live engine. Engine-internal keys (proxy, dgwHost, userAgent, ...) are rejected."
};
