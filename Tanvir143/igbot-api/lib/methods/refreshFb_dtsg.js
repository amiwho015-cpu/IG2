/**
 * File Name: refreshFb_dtsg.js
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
 * refreshFb_dtsg
 *
 * Force-refresh the internal tokens/claims used by the engine.
 *
 * @param {object} [obj] - Override object (usually omitted).
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.refreshFb_dtsg();
 */
module.exports = {
        name: "refreshFb_dtsg",
        kind: "engine",
        args: [
        {
                "name": "obj",
                "type": "object",
                "optional": true,
                "description": "Override object (usually omitted)."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Force-refresh the internal tokens/claims used by the engine."
};
