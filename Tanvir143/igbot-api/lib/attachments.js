/**
 * File Name: attachments.js
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

const UPLOAD_REF = "$upload";

function isReadableStream(value) {
        return !!value && typeof value === "object" && typeof value.pipe === "function" && typeof value.on === "function";
}

function toBuffer(input) {
        if (Buffer.isBuffer(input)) return Promise.resolve(input);
        if (typeof input === "string") {
                return require("fs").promises.readFile(input);
        }
        if (isReadableStream(input)) {
                return new Promise((resolve, reject) => {
                        const chunks = [];
                        input.on("data", c => chunks.push(c));
                        input.on("end", () => resolve(Buffer.concat(chunks)));
                        input.on("error", reject);
                });
        }
        return Promise.reject(new Error("Attachment must be a Buffer, readable stream, or file path"));
}

function nameOf(input) {
        if (!input) return "";
        if (typeof input === "string") return input;
        if (typeof input.name === "string") return input.name;
        if (typeof input.path === "string") return input.path;
        return "";
}

async function resolveValue(transport, sessionId, value) {
        if (typeof value === "function") {
                // A callback cannot cross the wire. Send null in its slot: the
                // engine treats a non-function there as "no callback" (promise
                // mode) while any trailing args keep their positions.
                return null;
        }
        // Strings are threadIDs, messageIDs, bodies, emojis, ids and URLs - they
        // pass through untouched. Remote media is uploaded from a Buffer/Stream
        // (the bot reads URLs into a stream before sending); a bare local path
        // would point at the server's filesystem, not the caller's.
        if (typeof value === "string") return value;
        if (Buffer.isBuffer(value) || isReadableStream(value)) {
                const buffer = await toBuffer(value);
                const handle = await transport.upload(sessionId, buffer, { name: nameOf(value), mime: value.__mime || "" });
                return { [UPLOAD_REF]: handle, name: nameOf(value), mime: value.__mime || "" };
        }
        if (Array.isArray(value)) {
                const out = [];
                for (const item of value) out.push(await resolveValue(transport, sessionId, item));
                return out;
        }
        if (value && typeof value === "object") {
                const out = {};
                for (const key of Object.keys(value)) out[key] = await resolveValue(transport, sessionId, value[key]);
                return out;
        }
        return value;
}

async function resolveArgs(transport, sessionId, args) {
        const out = [];
        for (const arg of args) out.push(await resolveValue(transport, sessionId, arg));
        return out;
}

module.exports = { resolveArgs, resolveValue, toBuffer, isReadableStream, UPLOAD_REF };
