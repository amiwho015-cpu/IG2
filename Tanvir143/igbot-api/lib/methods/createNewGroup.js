/**
 * File Name: createNewGroup.js
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
 * createNewGroup
 *
 * Create a new group thread and return its threadID.
 *
 * @param {string[]} participantIDs - User ids to include.
 * @param {string} [title] - Group name.
 * @param {(err, threadID) => void} [callback]
 * @returns {string}
 *
 * Example:
 *   api.createNewGroup(participantIDs, ...);
 */
module.exports = {
        name: "createNewGroup",
        kind: "engine",
        args: [
        {
                "name": "participantIDs",
                "type": "string[]",
                "optional": false,
                "description": "User ids to include."
        },
        {
                "name": "title",
                "type": "string",
                "optional": true,
                "description": "Group name."
        },
        {
                "name": "callback",
                "type": "(err, threadID) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "string",
        doc: "Create a new group thread and return its threadID."
};
