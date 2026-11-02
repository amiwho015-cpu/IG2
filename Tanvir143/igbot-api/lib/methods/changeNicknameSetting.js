/**
 * File Name: changeNicknameSetting.js
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
 * changeNicknameSetting
 *
 * Set who may change nicknames: `PEOPLE_YOU_FOLLOW` | `ONLY_YOU` | `EVERYONE`.
 *
 * @param {string} setting - PEOPLE_YOU_FOLLOW | ONLY_YOU | EVERYONE.
 * @param {string | number} threadID
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.changeNicknameSetting(setting, threadID, ...);
 */
module.exports = {
        name: "changeNicknameSetting",
        kind: "engine",
        args: [
        {
                "name": "setting",
                "type": "string",
                "optional": false,
                "description": "PEOPLE_YOU_FOLLOW | ONLY_YOU | EVERYONE."
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
        doc: "Set who may change nicknames: `PEOPLE_YOU_FOLLOW` | `ONLY_YOU` | `EVERYONE`."
};
