/**
 * File Name: helpers.js
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

const { resolveArgs } = require("./attachments");
const { mapError } = require("./transport");
const methodIndex = require("./methods");

function isFn(value) {
        return typeof value === "function";
}

/**
 * The callback is a local continuation, never a wire argument. It is most often
 * last, but a few engine methods declare it before a trailing optional arg
 * (`setMessageReaction(emoji, messageID, callback, forceCustomReaction)`,
 * `editMessage(text, messageID, callback, threadID)`), which is exactly how
 * Goat-Bot-IG calls them. Find the final function positionally so those shapes
 * work too; a trailing arg after it keeps its slot.
 */
function findCallback(args) {
        for (let i = args.length - 1; i >= 0; i--) {
                if (isFn(args[i])) return i;
        }
        return -1;
}

/**
 * Shape the caller's positional args into exactly the slots the server method
 * expects. The callback slot becomes `null` while every argument after it keeps
 * its position, so `replyToMessage`/`isGroup`/`forceCustomReaction` never shift.
 * Extra trailing args are dropped.
 */
function normalizeArgs(args, descriptor, cbIndex) {
        const cb = cbIndex === undefined ? findCallback(args) : cbIndex;
        const want = descriptor && Array.isArray(descriptor.args) ? descriptor.args.length : 0;
        if (!want) {
                const out = args.slice();
                if (cb >= 0) out.splice(cb, 1);
                return out;
        }
        const out = [];
        for (let i = 0; i < want; i++) {
                if (i === cb) out.push(null);
                else out.push(i < args.length ? args[i] : null);
        }
        return out;
}

/**
 * Resolve attachments and run one proxied api method. Preserves both calling
 * styles: pass a callback (anywhere in the tail, per the method signature), or
 * await the returned promise.
 */
function invoke(api, name, args) {
        const cbIndex = findCallback(args);
        const callback = cbIndex >= 0 ? args[cbIndex] : null;

        const wireArgs = normalizeArgs(args, methodIndex.get(name), cbIndex);
        const run = async () => {
                const resolved = await resolveArgs(api.transport, api.transport.sessionId, wireArgs);
                return api.transport.call(name, resolved);
        };

        if (callback) {
                run().then(res => callback(null, res)).catch(err => callback(mapError(err)));
                return undefined;
        }
        return run().catch(err => Promise.reject(mapError(err)));
}

function emojiUrl(c, size, pixelRatio) {
        const codepoints = Array.from(String(c || ""))
                .map(ch => ch.codePointAt(0).toString(16))
                .filter(cp => cp !== "fe0f")
                .join("-");
        const px = (size || 32) * (pixelRatio || 1);
        return "https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/" + codepoints + ".svg?size=" + px;
}

// Option keys the server accepts on a session. Kept in sync with the server's
// session option allowlist; everything else stays on the client.
const ENGINE_OPTION_KEYS = [
        "listenEvents", "selfListen", "selfListenEvent", "listenTyping",
        "updatePresence", "autoMarkDelivery", "autoMarkRead", "autoReconnect",
        "emitReady", "logLevel", "minRequestInterval", "keepAliveInterval",
        "tokenRefreshInterval", "realtimeKeepAlive", "realtimeTransport",
        "dgwTransport", "dgwStreamGroup", "dgwStreamController", "language"
];

function pickEngineOptions(options) {
        const out = {};
        for (const key of ENGINE_OPTION_KEYS) {
                if (options && options[key] !== undefined) out[key] = options[key];
        }
        return out;
}

module.exports = { isFn, normalizeArgs, invoke, emojiUrl, ENGINE_OPTION_KEYS, pickEngineOptions };
