/**
 * File Name: searchSessionTracking.js
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
 * searchSessionTracking
 *
 * Report a music search session (analytics).
 *
 * @param {string} audioAssetId - Track id from searchMusic.
 * @param {string} [alacornSessionId] - Session id for analytics.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.searchSessionTracking(audioAssetId, ...);
 */
module.exports = {
        name: "searchSessionTracking",
        kind: "engine",
        args: [
        {
                "name": "audioAssetId",
                "type": "string",
                "optional": false,
                "description": "Track id from searchMusic."
        },
        {
                "name": "alacornSessionId",
                "type": "string",
                "optional": true,
                "description": "Session id for analytics."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Report a music search session (analytics)."
};
