/**
 * File Name: realtime.js
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


/**
 * Realtime client.
 *
 * Opens the events WebSocket only when the caller actually listens (not at
 * login), reconnects with backoff, and maps server frames onto the
 * callback/emitter contract the bot expects.
 */
class RealtimeClient {
        constructor(transport, sessionId, options) {
                this.transport = transport;
                this.sessionId = sessionId;
                this.options = options || {};
                this.autoReconnect = this.options.autoReconnect !== false;
                this.ws = null;
                this.stopped = false;
                this.attempts = 0;
                this.emitter = null;
                this.callback = null;
                this.onConnected = typeof this.options.onConnected === "function" ? this.options.onConnected : null;
                this.onDisconnected = typeof this.options.onDisconnected === "function" ? this.options.onDisconnected : null;
                this.onError = typeof this.options.onError === "function" ? this.options.onError : null;
        }

        setCallback(cb) {
                this.callback = cb;
        }

        setEmitter(emitter) {
                this.emitter = emitter;
        }

        emit(err, event) {
                if (this.emitter) {
                        if (err) this.emitter.emit("error", err);
                        else if (event) this.emitter.emit(event.type || "message", event);
                        return;
                }
                if (this.callback) this.callback(err, event);
        }

        connect() {
                const base = this.transport.config.serverUrl.replace(/^http/, "ws");
                const url = base + "/v1/events?sessionId=" + encodeURIComponent(this.sessionId);
                const headers = {};
                if (this.transport.config.apiKey) headers["x-api-key"] = this.transport.config.apiKey;
                return new Promise((resolve, reject) => {
                        let WebSocket;
                        try { WebSocket = require("ws"); }
                        catch (error) {
                                reject(new Error('Missing dependency "ws". Run npm install in the project root.'));
                                return;
                        }
                        let settled = false;
                        const ws = new WebSocket(url, { headers });
                        this.ws = ws;
                        ws.on("open", () => {
                                this.attempts = 0;
                                if (this.onConnected) this.onConnected({ method: "websocket" });
                                if (!settled) { settled = true; resolve(); }
                        });
                        ws.on("message", data => this.onMessage(data));
                        ws.on("close", () => this.onClose());
                        ws.on("error", err => {
                                if (this.onError) this.onError(err);
                                if (!settled) { settled = true; reject(err); }
                        });
                });
        }

        onMessage(data) {
                let frame;
                try { frame = JSON.parse(data.toString()); } catch (e) { return; }
                if (frame.type === "event") {
                        this.emit(null, frame.event);
                        return;
                }
                if (frame.type === "ready") {
                        this.emit(null, { type: "ready", error: frame.error || null });
                        return;
                }
                if (frame.type === "stop_listen" || frame.type === "account_inactive") {
                        this.emit({ type: frame.type, error: frame.error }, null);
                        return;
                }
                if (frame.type === "error") {
                        this.emit({ error: frame.error }, null);
                }
        }

        onClose() {
                if (this.onDisconnected) this.onDisconnected({ reconnecting: !this.stopped && this.autoReconnect });
                if (this.stopped || !this.autoReconnect) return;
                this.attempts++;
                const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(this.attempts, 5)));
                setTimeout(() => {
                        if (this.stopped) return;
                        this.connect().catch(() => this.onClose());
                }, delay);
        }

        stop() {
                this.stopped = true;
                if (this.ws) {
                        try { this.ws.close(); } catch (e) { /* ignore */ }
                        this.ws = null;
                }
        }
}

module.exports = { RealtimeClient };
