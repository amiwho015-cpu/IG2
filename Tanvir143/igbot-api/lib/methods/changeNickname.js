/**
 * File Name: changeNickname.js
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
 * changeNickname
 *
 * Set or clear a participant's nickname.
 * Either `(nickname, threadID, participantID, cb)` or `({ nickname, threadID, participantID }, cb)`.
 * An empty nickname clears it.
 *
 * @param {string | object} nickname - New nickname; "" clears it. Or pass an options object.
 * @param {string | number} [threadID]
 * @param {string} [participantID] - The user whose nickname to set.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.changeNickname(nickname, ...);
 */
module.exports = {
        name: "changeNickname",
        kind: "engine",
        args: [
        {
                "name": "nickname",
                "type": "string | object",
                "optional": false,
                "description": "New nickname; \"\" clears it. Or pass an options object."
        },
        {
                "name": "threadID",
                "type": "string | number",
                "optional": true,
                "description": ""
        },
        {
                "name": "participantID",
                "type": "string",
                "optional": true,
                "description": "The user whose nickname to set."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Set or clear a participant's nickname. Either `(nickname, threadID, participantID, cb)` or `({ nickname, threadID, participantID }, cb)`. An empty nickname clears it."
};
