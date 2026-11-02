/**
 * File Name: getCurrentUserID.js
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
 * getCurrentUserID
 *
 * The logged-in account id.
 * Answered from the login manifest, no round trip.
 * Synchronous - no callback.
 * Synchronous: answered from the login manifest. No callback, no round trip.
 *
 * (no arguments)
 * @returns {string}
 *
 * Example:
 *   api.getCurrentUserID();
 */
module.exports = {
        name: "getCurrentUserID",
        kind: "sync",
        args: [],
        returns: "string",
        doc: "The logged-in account id. Answered from the login manifest, no round trip. Synchronous - no callback."
};
