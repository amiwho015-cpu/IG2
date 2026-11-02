/**
 * File Name: api.js
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

const EventEmitter = require("events");
const { RealtimeClient } = require("./realtime");
const { mapError } = require("./transport");
const methodIndex = require("./methods");
const helpers = require("./helpers");

// Every method the client proxies, derived from the per-method descriptors in
// lib/methods/*.js (name, kind, args, returns, docs). `sync` members are
// answered locally (see installSyncMembers) and `engine`/`server` members are
// proxied to the server.
const DEFAULT_METHODS = methodIndex.MODULES.map(m => m.name);

function isFn(value) {
        return typeof value === "function";
}

class ClientApi extends EventEmitter {
        constructor(transport, manifest, loginData) {
                super();
                this.transport = transport;
                this.manifest = manifest || {};
                this.loginData = loginData || {};
                this.userID = String(loginData.userID || manifest.userID || "");
                this.options = loginData.options || {};
                this.realtime = null;
                this.methods = methodIndex.list();
                this.installMethods();
                this.installSyncMembers();
                this.installCompatibilityMethods();
                // `listen` is a stable alias for listenMqtt from construction
                // onwards, not only after the first listenMqtt call.
                this.listen = (...args) => this.listenMqtt(...args);
        }

        installMethods() {
                // Trust the server manifest when it lists methods, but always
                // install every descriptor so a forward/backward version skew
                // never hides a method the server does expose.
                const names = new Set(DEFAULT_METHODS);
                if (Array.isArray(this.manifest.methods)) for (const n of this.manifest.methods) names.add(n);
                if (Array.isArray(this.manifest.syncMethods)) for (const n of this.manifest.syncMethods) names.add(n);
                if (Array.isArray(this.manifest.serverMethods)) for (const n of this.manifest.serverMethods) names.add(n);
                names.add("sendMessage");
                names.add("unsendMessage");
                names.add("setMessageReaction");
                names.add("resolvePhotoUrl");
                names.add("setListenerOptions");
                names.add("getListenerOptions");
                // Optional WONICA-style methods. They are proxied transparently;
                // the configured server must advertise/implement a given method.
                for (const n of [
                        "searchUsers", "searchHashtags", "searchPlaces", "searchReels",
                        "getUserStories", "getFeedStories", "reactToStory", "replyToStory",
                        "getLiveFeed", "sendLiveComment", "sendLiveHeart", "markAsUnread",
                        "sendDirectMessage", "sendPhoto", "sendPhotoFromUrl", "sendVideo",
                        "sendVideoFromUrl", "sendVoice", "sendVoiceFromUrl", "sendGIF",
                        "replyToMessage", "sendReaction", "removeReaction", "getInbox"
                ]) names.add(n);

                for (const name of names) {
                        if (name === "getCurrentUserID" || name === "getEmojiUrl") continue;
                        if (name === "getAppState") continue; // explicit implementation below
                        const desc = methodIndex.get(name);
                        if (desc && desc.kind === "sync") continue; // local members
                        this[name] = this.makeProxy(name);
                }

                // Convenience overrides.
                this.setListenerOptions = (options, callback) => {
                        Object.assign(this.options, options || {});
                        const run = () => this.transport.call("setListenerOptions", [options || {}]);
                        if (isFn(callback)) { run().then(r => callback(null, r)).catch(e => callback(mapError(e))); return undefined; }
                        return run().catch(err => Promise.reject(mapError(err)));
                };
                this.getListenerOptions = (callback) => {
                        const run = () => this.transport.call("getListenerOptions", []);
                        if (isFn(callback)) { run().then(r => callback(null, r)).catch(e => callback(mapError(e))); return undefined; }
                        return run().catch(err => Promise.reject(mapError(err)));
                };
        }

        installCompatibilityMethods() {
                const callbackResult = (promise, callback) => {
                        if (typeof callback === "function") {
                                Promise.resolve(promise).then(value => callback(null, value), error => callback(mapError(error)));
                                return undefined;
                        }
                        return Promise.resolve(promise);
                };
                // Wonica-style lifecycle helpers, without changing the original
                // login({appState}, options, callback) contract.
                this.getCurrentUser = () => ({ userID: this.userID, username: this.manifest.username || null });
                this.getHealth = () => ({
                        authenticated: Boolean(this.transport && this.transport.sessionId),
                        listening: Boolean(this.realtime && !this.realtime.stopped),
                        mqtt: { connected: Boolean(this.realtime && this.realtime.ws && this.realtime.ws.readyState === 1), reconnectAttempts: this.realtime ? this.realtime.attempts : 0 },
                        transport: { serverUrl: this.transport && this.transport.config ? this.transport.config.serverUrl : null }
                });
                this.getInbox = (options, callback) => {
                        if (typeof options === "function") { callback = options; options = {}; }
                        options = options || {};
                        return this.getThreadList(options.limit, options.timestamp, options.tags, callback);
                };
                this.getUserInfoByUsername = (username, callback) => {
                        const promise = this.getUserID(String(username || "").replace(/^@/, "")).then(id => this.getUserInfo(id));
                        return callbackResult(promise, callback);
                };
                this.replyToMessage = (threadID, text, replyToMessageID, callback) =>
                        this.sendMessage({ body: String(text == null ? "" : text) }, threadID, callback, replyToMessageID);
                this.sendReaction = (emoji, messageID, callback) => this.setMessageReaction(emoji, messageID, callback);
                this.stopTypingIndicator = (threadID, callback) => this.sendTypingIndicator(threadID, false, callback);
                this.sendPhoto = (threadID, file, callback) => this.sendMessage({ attachment: file }, threadID, callback);
                this.sendVideo = (threadID, file, callback) => this.sendMessage({ attachment: file, mediaType: "video" }, threadID, callback);
                this.sendVoice = (threadID, file, callback) => this.sendMessage({ attachment: file, mediaType: "audio" }, threadID, callback);
                this.sendPhotoFromUrl = (threadID, url, callback) => this.sendMessage({ url, mediaType: "photo" }, threadID, callback);
                this.sendVideoFromUrl = (threadID, url, callback) => this.sendMessage({ url, mediaType: "video" }, threadID, callback);
                this.sendVoiceFromUrl = (threadID, url, callback) => this.sendMessage({ url, mediaType: "audio" }, threadID, callback);
                this.sendGIF = (threadID, url, callback) => this.sendMessage({ url, mediaType: "gif" }, threadID, callback);

                // GoatBot / older InstaBot command compatibility aliases.
                // Keep the ICA's original methods and login contract intact.
                this._userID = this.userID;
                this.addUserToThread = (userID, threadID, callback) => this.addUserToGroup(userID, threadID, callback);
                this.removeUserFromThread = (userID, threadID, callback) => this.removeUserFromGroup(userID, threadID, callback);
                this.musicSearch = (query, callback) => this.searchMusic(query, callback);
                this.sendMusic = (threadID, track, callback) => this.sendMusicSticker(track, threadID, callback);
                this.sendImage = (source, threadID, caption, callback, replyToMessageID) => {
                        if (typeof caption === "function") { replyToMessageID = callback; callback = caption; caption = ""; }
                        const message = { attachment: source };
                        if (caption != null && caption !== "") message.body = String(caption);
                        return this.sendMessage(message, threadID, callback, replyToMessageID);
                };
                this.sendVideo = (source, threadID, callback, replyToMessageID) =>
                        this.sendMessage({ attachment: source, mediaType: "video" }, threadID, callback, replyToMessageID);
                this.sendAudio = (source, threadID, callback, replyToMessageID) =>
                        this.sendMessage({ attachment: source, mediaType: "audio" }, threadID, callback, replyToMessageID);
                this.sendTextEffect = (text, threadID, effect, callback) =>
                        this.sendMessage({ body: String(text == null ? "" : text), effect }, threadID, callback);
                this.sendAvatarTextEffect = (text, threadID, effect, callback) =>
                        this.sendMessage({ body: String(text == null ? "" : text), avatarEffect: effect }, threadID, callback);

                // GoatBot calls sendTypingIndicator(threadID, callback) as well
                // as sendTypingIndicator(threadID, isTyping, callback).
                const sendTypingIndicatorProxy = this.sendTypingIndicator.bind(this);
                this.sendTypingIndicator = (threadID, isTyping, callback) => {
                        if (typeof isTyping === "function") { callback = isTyping; isTyping = true; }
                        return sendTypingIndicatorProxy(threadID, isTyping === undefined ? true : isTyping, callback);
                };

                // If the server exposes these extra methods, the generated proxy
                // can call them; if not, the server returns a normal mapped error.
                for (const name of ["searchUsers", "searchHashtags", "searchPlaces", "searchReels", "getUserStories", "getFeedStories", "reactToStory", "replyToStory", "getLiveFeed", "sendLiveComment", "sendLiveHeart", "markAsUnread", "sendDirectMessage", "removeReaction"]) {
                        if (typeof this[name] !== "function") this[name] = this.makeProxy(name);
                }
        }

        makeProxy(name) {
                const self = this;
                return function (...args) {
                        return helpers.invoke(self, name, args);
                };
        }

        installSyncMembers() {
                const self = this;
                this.getCurrentUserID = () => self.userID;
                this.getEmojiUrl = (c, size, ratio) => helpers.emojiUrl(c, size, ratio);
                this.listEffects = () => self.manifest.effects || [];
                this.listAvatarEffects = () => self.manifest.avatarEffects || [];
                this.isAvatarSupported = name => (self.manifest.avatarEffects || []).some(a => a.name === name);
                this.threadColors = this.manifest.threadColors || {};
                this.effects = {
                        list: this.listEffects,
                        listEffects: this.listEffects,
                        listAvatarEffects: this.listAvatarEffects,
                        avatars: this.manifest.avatarEffects || [],
                        resolve: this.listEffects
                };
        }

        getAppState(callback) {
                const self = this;
                const run = () => self.transport.call("getAppState", []);
                if (isFn(callback)) { run().then(r => callback(null, r)).catch(e => callback(mapError(e))); return undefined; }
                return run().catch(err => Promise.reject(mapError(err)));
        }

        /**
         * Options used to live only on the client; here they are pushed to the
         * server so the engine listener actually picks them up. A local copy is
         * kept for the realtime client (autoReconnect, ...).
         */
        setOptions(options) {
                options = options || {};
                Object.assign(this.options, options);
                return this.setListenerOptions(options);
        }

        getCtx() {
                return undefined;
        }

        addExternalModule() {
                throw new Error("addExternalModule is not supported by the hosted client");
        }

        listenMqtt(rawCallback, options) {
                const usingEmitter = !isFn(rawCallback);
                const emitter = new EventEmitter();
                emitter.setMaxListeners(0);
                const realtimeOptions = Object.assign({}, this.options, options, {
                        onConnected: info => this.emit("connected", info || { method: "websocket" }),
                        onDisconnected: info => this.emit("disconnected", info || {}),
                        onError: err => { if (this.listenerCount("error")) this.emit("error", err); }
                });
                const realtime = new RealtimeClient(this.transport, this.transport.sessionId, realtimeOptions);
                this.realtime = realtime;
                if (usingEmitter) realtime.setEmitter(emitter);
                else realtime.setCallback(rawCallback);

                const stop = () => {
                        realtime.stop();
                        this.realtime = null;
                };
                stop.realtime = realtime;
                stop.channel = realtime;
                stop.stopListening = stop;
                stop.stopListeningAsync = () => new Promise(resolve => { stop(); resolve(); });
                emitter.stopListening = stop;
                emitter.stopListeningAsync = stop.stopListeningAsync;
                emitter.realtime = realtime;

                // Apply any per-listen realtime options server-side before
                // connecting, so the engine listener honours them.
                const apply = options ? this.setListenerOptions(helpers.pickEngineOptions(options)) : Promise.resolve();
                apply.catch(() => { })
                        .then(() => realtime.connect())
                        .catch(err => {
                                if (usingEmitter) emitter.emit("error", { error: err && err.message || String(err) });
                                else if (isFn(rawCallback)) rawCallback({ error: err && err.message || String(err) }, null);
                        });

                this.stopListening = cb => { stop(); if (isFn(cb)) cb(); };
                this.stopListeningAsync = () => new Promise(resolve => this.stopListening(resolve));
                this.listen = this.listenMqtt;

                return usingEmitter ? emitter : stop;
        }

        stopListening(cb) {
                if (this.realtime) this.realtime.stop();
                this.realtime = null;
                if (isFn(cb)) cb();
        }

        stopListeningAsync() {
                return new Promise(resolve => this.stopListening(resolve));
        }

        get keepAlive() {
                return { stop: () => this.stopListening() };
        }
}

module.exports = { ClientApi, DEFAULT_METHODS };
