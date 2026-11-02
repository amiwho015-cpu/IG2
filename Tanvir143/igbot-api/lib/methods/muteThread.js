/**
 * File Name: muteThread.js
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
 * muteThread
 *
 * Mute a thread.
 * `muteSeconds` -1 unmutes.
 *
 * @param {string | number} threadID
 * @param {number} [muteSeconds] - Mute duration in seconds; -1 unmutes.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.muteThread(threadID, ...);
 */
module.exports = {
        name: "muteThread",
        kind: "engine",
        args: [
        {
                "name": "threadID",
                "type": "string | number",
                "optional": false,
                "description": ""
        },
        {
                "name": "muteSeconds",
                "type": "number",
                "optional": true,
                "description": "Mute duration in seconds; -1 unmutes."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Mute a thread. `muteSeconds` -1 unmutes."
};
