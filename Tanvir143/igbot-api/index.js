/**
 * File Name: index.js
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
 * @lazyneoaz/ig-chat-api
 *
 * A thin, dependency-light client for a hosted ig-chat-api server. The public
 * surface exposes the familiar login / api.sendMessage / api.listenMqtt shape
 * so Goat-Bot-IG can run against Instagram by swapping the dependency and
 * adding an API key to config.json.
 *
 *   const login = require("@lazyneoaz/ig-chat-api");
 *   login({ appState: [...] }, { }, (err, api) => {
 *       api.listenMqtt((err, event) => { ... });
 *   });
 */
const { Transport, mapError, normalizeAppState, looksLikeSession } = require("./lib/transport");
const { ClientApi, DEFAULT_METHODS } = require("./lib/api");
const config = require("./lib/config");
const helpers = require("./lib/helpers");

const CONSTANTS = Object.freeze({
        API_VERSION: "1.0.0",
        SERVER_URL: config.DEFAULT_SERVER_URL
});

/**
 * Server-backed utility surface, mirrored to the engine's `utils` shape so bot
 * code written against the full engine (Goat-Bot-IG's login probe calls
 * `utils.getJar()`, `utils.makeDefaults()` and `utils.checkLiveCookie(ctx)`)
 * works unchanged. The liveness check runs server-side against the real engine;
 * `getJar`/`makeDefaults` are lightweight shims so the caller's cookie handling
 * still runs. `makeDefaults` returns a stub - the hosted client performs no
 * Instagram requests locally.
 */
const utils = {
        normalizeAppState,
        looksLikeSession,

        /** Minimal cookie jar matching the engine's setCookie(cookieStr, url). */
        getJar() {
                const cookies = {};
                return {
                        cookies,
                        setCookie(cookieStr) {
                                const pair = String(cookieStr).split(";")[0];
                                const i = pair.indexOf("=");
                                if (i > 0) cookies[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
                        },
                        getCookieString() {
                                return Object.keys(cookies).map(k => k + "=" + cookies[k]).join("; ");
                        }
                };
        },

        /** Stub matching the engine signature; the client sends no IG requests. */
        makeDefaults() {
                return {};
        },

        /**
         * Liveness probe. Accepts either an appState (array / cookie string) or an
         * engine-style `ctx` carrying a `.jar`, matching how the bot calls it.
         */
        async checkLiveCookie(appStateOrCtx, options) {
                let cookies = normalizeAppState(appStateOrCtx);
                if (!cookies.length && appStateOrCtx && appStateOrCtx.jar && appStateOrCtx.jar.cookies) {
                        cookies = Object.keys(appStateOrCtx.jar.cookies)
                                .map(k => ({ key: k, value: appStateOrCtx.jar.cookies[k] }));
                }
                if (!cookies.length) return false;

                const override = options && options.serverUrl;
                const wantUrl = override || (options && options.url) || process.env.CHAT_API_URL;
                const overrideKey = (options && options.apiKey) || process.env.CHAT_API_KEY;
                const serverUrl = (wantUrl || config.DEFAULT_SERVER_URL).replace(/\/+$/, "");
                const apiKey = overrideKey || config.DEFAULT_API_KEY;
                if (!serverUrl || !apiKey) return looksLikeSession(cookies);

                const transport = new Transport({ serverUrl, apiKey });
                try {
                        const res = await transport.probe(cookies);
                        return !!(res && res.live);
                } catch (e) {
                        return false;
                } finally {
                        transport.close();
                }
        }
};

function setOptions(options) {
        // Compatibility: called before login, these options are merged into the
        // login options on the next login().
        setOptions._pending = Object.assign(setOptions._pending || {}, options || {});
}

function normalizeOptions(options, loginData) {
        options = Object.assign({}, setOptions._pending || {}, options || {});
        const chatApi = (loginData && (loginData.chatApiServer || loginData.chatApi)) || {};
        return {
                serverUrl: options.serverUrl || chatApi.url || chatApi.serverUrl,
                apiKey: options.apiKey || chatApi.apiKey || options.key,
                timeoutMs: options.timeoutMs,
                maxRetries: options.maxRetries,
                // Engine/realtime options forwarded to the server on session create.
                engineOptions: helpers.pickEngineOptions(options)
        };
}

function login(loginData, options, callback) {
        if (typeof options === "function") {
                callback = options;
                options = {};
        }
        options = options || {};

        const transport = new Transport(normalizeOptions(options, loginData));

        const hasCallback = typeof callback === "function";
        let resolveFunc = () => { };
        let rejectFunc = () => { };
        let returnPromise;
        if (!hasCallback) {
                returnPromise = new Promise((resolve, reject) => {
                        resolveFunc = resolve;
                        rejectFunc = reject;
                });
        }

        const done = (err, api) => {
                if (hasCallback) {
                        callback(err || null, api || null);
                        return;
                }
                if (err) rejectFunc(err);
                else resolveFunc(api);
        };

        if (!transport.config.apiKey) {
                done({ error: "No API key given. Add chatApiServer.apiKey to config.json or set CHAT_API_KEY." });
                return returnPromise;
        }

        const appState = loginData && (loginData.appState || loginData.cookies || loginData.session);
        if (!appState) {
                done({ error: "No cookies/appState given. Provide at least a sessionid and ds_user_id cookie." });
                return returnPromise;
        }

        transport.createSession(appState, transport.config.engineOptions || {})
                .then(result => {
                        if (!result || !result.sessionId) return done({ error: "Login failed: server did not return a session" });
                        transport.setSessionId(result.sessionId);
                        const api = new ClientApi(transport, result.manifest, {
                                userID: result.userID,
                                options: Object.assign({}, transport.config.engineOptions || {})
                        });
                        api.sessionId = result.sessionId;
                        done(null, api);
                })
                .catch(err => done(mapError(err)));

        return returnPromise;
}

login.setOptions = setOptions;
login.CONSTANTS = CONSTANTS;
login.connect = login;
login.config = config;
login.methods = DEFAULT_METHODS;
login.utils = utils;

module.exports = login;
module.exports.default = login;
// Named exports support frameworks that use destructuring without changing
// the original callback/Promise login signature.
module.exports.login = login;
module.exports.connect = login;
module.exports.utils = utils;
module.exports.CONSTANTS = CONSTANTS;
module.exports.Api = ClientApi;
