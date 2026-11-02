/**
 * File Name: setMessageReaction.js
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
 * setMessageReaction
 *
 * React to a message.
 * Pass an emoji, or an object for a custom reaction.
 *
 * @param {string | object} reaction - Emoji, or a custom-reaction object.
 * @param {string} messageID
 * @param {(err) => void} [callback]
 * @param {boolean} [forceCustomReaction] - Force the custom-reaction path.
 * @returns {unknown}
 *
 * Example:
 *   api.setMessageReaction(reaction, messageID, ...);
 */
module.exports = {
        name: "setMessageReaction",
        kind: "engine",
        args: [
        {
                "name": "reaction",
                "type": "string | object",
                "optional": false,
                "description": "Emoji, or a custom-reaction object."
        },
        {
                "name": "messageID",
                "type": "string",
                "optional": false,
                "description": ""
        },
        {
                "name": "callback",
                "type": "(err) => void",
                "optional": true,
                "description": ""
        },
        {
                "name": "forceCustomReaction",
                "type": "boolean",
                "optional": true,
                "description": "Force the custom-reaction path."
        }
],
        returns: "unknown",
        doc: "React to a message. Pass an emoji, or an object for a custom reaction."
};
