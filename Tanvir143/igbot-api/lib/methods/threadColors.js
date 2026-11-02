/**
 * File Name: threadColors.js
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
 * threadColors
 *
 * The supported thread colors (empty on Instagram Direct).
 * Synchronous property.
 * Synchronous: answered from the login manifest. No callback, no round trip.
 *
 * (no arguments)
 * @returns {Record<string, unknown>}
 *
 * Example:
 *   api.threadColors();
 */
module.exports = {
        name: "threadColors",
        kind: "sync",
        args: [],
        returns: "Record<string, unknown>",
        doc: "The supported thread colors (empty on Instagram Direct). Synchronous property."
};
