/**
 * File Name: config.js
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
 * Client configuration.
 *
 * The server URL and shared API key ship with the package so bot owners never
 * set anything: login just works. Both can still be overridden per-login or
 * through the environment for local/self-hosted testing.
 */
const DEFAULT_SERVER_URL = process.env.CHAT_API_URL || "https://ica.neokex.xyz";

// Shared key bundled with the client. The server must be configured with the
// same value (API_KEY). It is not a secret in the security sense: it scopes the
// client to this service, it is not an Instagram credential, and every user of
// the published package already holds it. Rotate by updating the server
// env var and shipping a new client version.
const DEFAULT_API_KEY = process.env.CHAT_API_KEY || "neokex-ig-chat-api";

function resolve(options) {
        options = options || {};
        return {
                serverUrl: (options.serverUrl || options.url || process.env.CHAT_API_URL || DEFAULT_SERVER_URL).replace(/\/+$/, ""),
                apiKey: options.apiKey || options.key || process.env.CHAT_API_KEY || DEFAULT_API_KEY,
                timeoutMs: Number(options.timeoutMs || process.env.CHAT_API_TIMEOUT_MS || 30000),
                maxRetries: Number(options.maxRetries || 2),
                // Engine/realtime options forwarded verbatim (already filtered by
                // index.js) so the server can apply them on session create.
                engineOptions: options.engineOptions || {}
        };
}

module.exports = { resolve, DEFAULT_SERVER_URL, DEFAULT_API_KEY };
