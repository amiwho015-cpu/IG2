/**
 * File Name: isAvatarSupported.js
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
 * isAvatarSupported
 *
 * Whether an avatar effect name is supported.
 * Answered from the manifest.
 * Synchronous.
 * Synchronous: answered from the login manifest. No callback, no round trip.
 *
 * @param {string} name
 * @returns {boolean}
 *
 * Example:
 *   api.isAvatarSupported(name);
 */
module.exports = {
        name: "isAvatarSupported",
        kind: "sync",
        args: [
        {
                "name": "name",
                "type": "string",
                "optional": false,
                "description": ""
        }
],
        returns: "boolean",
        doc: "Whether an avatar effect name is supported. Answered from the manifest. Synchronous."
};
