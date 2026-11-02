/**
 * File Name: listAvatarEffects.js
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
 * listAvatarEffects
 *
 * List the available avatar effects.
 * Answered from the manifest, no round trip.
 * Synchronous.
 * Synchronous: answered from the login manifest. No callback, no round trip.
 *
 * (no arguments)
 * @returns {AvatarEffectInfo[]}
 *
 * Example:
 *   api.listAvatarEffects();
 */
module.exports = {
        name: "listAvatarEffects",
        kind: "sync",
        args: [],
        returns: "AvatarEffectInfo[]",
        doc: "List the available avatar effects. Answered from the manifest, no round trip. Synchronous."
};
