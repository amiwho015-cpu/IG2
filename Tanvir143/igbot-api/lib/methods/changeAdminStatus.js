/**
 * File Name: changeAdminStatus.js
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
 * changeAdminStatus
 *
 * Grant or revoke admin on a group thread.
 *
 * @param {string | number} threadID
 * @param {string | string[]} adminIDs - One id or an array of ids.
 * @param {boolean} adminStatus - true to grant admin, false to revoke.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.changeAdminStatus(threadID, adminIDs, adminStatus, ...);
 */
module.exports = {
        name: "changeAdminStatus",
        kind: "engine",
        args: [
        {
                "name": "threadID",
                "type": "string | number",
                "optional": false,
                "description": ""
        },
        {
                "name": "adminIDs",
                "type": "string | string[]",
                "optional": false,
                "description": "One id or an array of ids."
        },
        {
                "name": "adminStatus",
                "type": "boolean",
                "optional": false,
                "description": "true to grant admin, false to revoke."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Grant or revoke admin on a group thread."
};
