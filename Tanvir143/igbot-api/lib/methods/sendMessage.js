/**
 * File Name: sendMessage.js
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
 * sendMessage
 *
 * Send a message to one or more threads.
 * `message` is a plain string body or a MessageOptions object (body, attachment, url, sticker, emoji, mentions, location, avatar/effect power-ups, music).
 * `attachment` may be a Buffer, readable stream or file path - the client uploads it first.
 * `replyToMessageID` links a reply.
 *
 * @param {string | MessageOptions} message - Body string, or a MessageOptions object (body/attachment/url/sticker/emoji/mentions/location/avatar/effect/music).
 * @param {string | number | Array<string|number>} threadID - Destination thread id (or ids).
 * @param {(err, info) => void} [callback] - Node-style callback; omit to use the returned promise.
 * @param {string} [replyToMessageID] - Id of the message to reply to.
 * @param {boolean} [isGroup] - Set for group threads when the engine needs it.
 * @returns {{ messageID, threadID, timestamp, messageIDs?, attachmentCount? }}
 *
 * Example:
 *   api.sendMessage(message, threadID, ...);
 */
module.exports = {
        name: "sendMessage",
        kind: "engine",
        args: [
        {
                "name": "message",
                "type": "string | MessageOptions",
                "optional": false,
                "description": "Body string, or a MessageOptions object (body/attachment/url/sticker/emoji/mentions/location/avatar/effect/music)."
        },
        {
                "name": "threadID",
                "type": "string | number | Array<string|number>",
                "optional": false,
                "description": "Destination thread id (or ids)."
        },
        {
                "name": "callback",
                "type": "(err, info) => void",
                "optional": true,
                "description": "Node-style callback; omit to use the returned promise."
        },
        {
                "name": "replyToMessageID",
                "type": "string",
                "optional": true,
                "description": "Id of the message to reply to."
        },
        {
                "name": "isGroup",
                "type": "boolean",
                "optional": true,
                "description": "Set for group threads when the engine needs it."
        }
],
        returns: "{ messageID, threadID, timestamp, messageIDs?, attachmentCount? }",
        doc: "Send a message to one or more threads. `message` is a plain string body or a MessageOptions object (body, attachment, url, sticker, emoji, mentions, location, avatar/effect power-ups, music). `attachment` may be a Buffer, readable stream or file path - the client uploads it first. `replyToMessageID` links a reply."
};
