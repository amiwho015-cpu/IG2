/**
 * File Name: logout.js
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
 * logout
 *
 * Log the account out and invalidate the session.
 *
 * @param {(err) => void} [callback] - Called once the session is invalidated.
 * @returns {unknown}
 *
 * Example:
 *   api.logout();
 */
module.exports = {
        name: "logout",
        kind: "engine",
        args: [
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": "Called once the session is invalidated."
        }
],
        returns: "unknown",
        doc: "Log the account out and invalidate the session."
};
