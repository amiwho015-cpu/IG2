/**
 * File Name: changeArchivedStatus.js
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
 * changeArchivedStatus
 *
 * Archive or unarchive one or more threads.
 *
 * @param {string | number | Array} threadOrThreads
 * @param {boolean} [archive] - true to archive, false to unarchive.
 * @param {(err) => void} [callback]
 * @returns {unknown}
 *
 * Example:
 *   api.changeArchivedStatus(threadOrThreads, ...);
 */
module.exports = {
        name: "changeArchivedStatus",
        kind: "engine",
        args: [
        {
                "name": "threadOrThreads",
                "type": "string | number | Array",
                "optional": false,
                "description": ""
        },
        {
                "name": "archive",
                "type": "boolean",
                "optional": true,
                "description": "true to archive, false to unarchive."
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "unknown",
        doc: "Archive or unarchive one or more threads."
};
