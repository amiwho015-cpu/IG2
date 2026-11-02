/**
 * File Name: getThreadList.js
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
 * getThreadList
 *
 * List threads from the inbox (optionally PENDING / SPAM via `tags`).
 * Paged until `limit`.
 *
 * @param {number} [limit] - Max threads to return.
 * @param {string | null} [timestamp] - Paging cursor (null for the newest page).
 * @param {string[]} [tags] - Folder tags, e.g. ["PENDING"] or ["SPAM"].
 * @param {(err, threads, info) => void} [callback]
 * @returns {Array<Thread>}
 *
 * Example:
 *   api.getThreadList();
 */
module.exports = {
        name: "getThreadList",
        kind: "engine",
        args: [
        {
                "name": "limit",
                "type": "number",
                "optional": true,
                "description": "Max threads to return."
        },
        {
                "name": "timestamp",
                "type": "string | null",
                "optional": true,
                "description": "Paging cursor (null for the newest page)."
        },
        {
                "name": "tags",
                "type": "string[]",
                "optional": true,
                "description": "Folder tags, e.g. [\"PENDING\"] or [\"SPAM\"]."
        },
        {
                "name": "callback",
                "type": "(err, threads, info) => void",
                "optional": true,
                "description": ""
        }
],
        returns: "Array<Thread>",
        doc: "List threads from the inbox (optionally PENDING / SPAM via `tags`). Paged until `limit`."
};
