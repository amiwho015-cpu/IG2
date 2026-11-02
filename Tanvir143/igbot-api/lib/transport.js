/**
 * File Name: transport.js
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

const http = require("http");
const https = require("https");
const { URL } = require("url");
const { resolve } = require("./config");

const CODES = {
        UNAUTHORIZED: -32001,
        SESSION_NOT_FOUND: -32002,
        SESSION_EXPIRED: -32003,
        RATE_LIMITED: -32004,
        CAPACITY: -32005,
        ENGINE_ERROR: -32010
};

function mapError(error) {
        if (!error) return { error: "Unknown error" };
        const message = error.message || String(error);
        if (error.code === CODES.UNAUTHORIZED) return { error: "Unauthorized: invalid or missing API key" };
        if (error.code === CODES.SESSION_NOT_FOUND || error.code === CODES.SESSION_EXPIRED) return { error: "Not logged in" };
        if (error.code === CODES.RATE_LIMITED) return { error: "Connection refused: Server unavailable" };
        if (error.code === CODES.CAPACITY) return { error: "Connection refused: Server unavailable" };
        return { error: message, code: error.code };
}

class Transport {
        constructor(options) {
                this.config = resolve(options);
                this.agents = {
                        http: new http.Agent({ keepAlive: true }),
                        https: new https.Agent({ keepAlive: true })
                };
                this.seq = 0;
        }

        setSessionId(sessionId) {
                this.sessionId = sessionId;
        }

        setApiKey(apiKey) {
                this.config.apiKey = apiKey;
        }

        async call(method, params) {
                const body = JSON.stringify({
                        jsonrpc: "2.0",
                        id: ++this.seq,
                        sessionId: this.sessionId,
                        method,
                        params: params || []
                });
                const res = await this.request("POST", "/v1/rpc", body, { "content-type": "application/json" });
                let parsed;
                try { parsed = JSON.parse(res.text); } catch (e) { throw { error: "Invalid response from server" }; }
                if (parsed.error) {
                        const err = new Error(parsed.error.message || "Server error");
                        err.code = parsed.error.code;
                        err.data = parsed.error.data;
                        throw err;
                }
                return parsed.result;
        }

        async createSession(appState, options) {
                const body = JSON.stringify({ jsonrpc: "2.0", id: ++this.seq, appState, options: options || {} });
                const res = await this.request("POST", "/v1/sessions", body, { "content-type": "application/json" });
                const parsed = JSON.parse(res.text);
                if (parsed.error) {
                        const err = new Error(parsed.error.message || "Login failed");
                        err.code = parsed.error.code;
                        throw err;
                }
                return parsed.result;
        }

        async deleteSession(sessionId) {
                const res = await this.request("DELETE", "/v1/sessions/" + sessionId, null, {});
                try { return JSON.parse(res.text).result; } catch (e) { return { ok: true }; }
        }

        async sessionHealth(sessionId) {
                const res = await this.request("GET", "/v1/sessions/" + sessionId + "/health", null, {});
                try { return JSON.parse(res.text).result; } catch (e) { return { live: false }; }
        }

        /**
         * Sessionless liveness probe. Validates an appState against the server
         * without creating/storing a session. Returns { live, accountID, ... }.
         */
        async probe(appState) {
                const body = JSON.stringify({ jsonrpc: "2.0", id: ++this.seq, appState });
                const res = await this.request("POST", "/v1/probe", body, { "content-type": "application/json" });
                const parsed = JSON.parse(res.text);
                if (parsed.error) {
                        const err = new Error(parsed.error.message || "Probe failed");
                        err.code = parsed.error.code;
                        throw err;
                }
                return parsed.result;
        }

        async upload(sessionId, buffer, meta) {
                const headers = {
                        "content-type": (meta && meta.mime) || "application/octet-stream",
                        "x-file-name": encodeURIComponent((meta && meta.name) || "")
                };
                const res = await this.request("POST", "/v1/sessions/" + sessionId + "/attachments", buffer, headers, true);
                const parsed = JSON.parse(res.text);
                if (parsed.error) {
                        const err = new Error(parsed.error.message || "Upload failed");
                        err.code = parsed.error.code;
                        throw err;
                }
                return parsed.result.handle;
        }

        request(method, path, body, headers, raw) {
                const url = new URL(this.config.serverUrl + path);
                const isHttps = url.protocol === "https:";
                const lib = isHttps ? https : http;
                const agent = isHttps ? this.agents.https : this.agents.http;
                const payload = body === null || body === undefined
                        ? null
                        : (Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8"));

                const allHeaders = Object.assign(
                        {
                                "x-api-key": this.config.apiKey,
                                "accept": "application/json"
                        },
                        headers || {}
                );
                if (payload && !raw) allHeaders["content-length"] = String(payload.length);
                if (payload && raw) allHeaders["content-length"] = String(payload.length);

                return this.attempt(lib, agent, url, method, allHeaders, payload, 0);
        }

        attempt(lib, agent, url, method, headers, payload, tries) {
                return new Promise((resolve, reject) => {
                        const req = lib.request({
                                protocol: url.protocol,
                                hostname: url.hostname,
                                port: url.port || (url.protocol === "https:" ? 443 : 80),
                                path: url.pathname + url.search,
                                method,
                                headers,
                                agent,
                                timeout: this.config.timeoutMs
                        }, res => {
                                const chunks = [];
                                res.on("data", c => chunks.push(c));
                                res.on("end", () => {
                                        const text = Buffer.concat(chunks).toString("utf8");
                                        if (res.statusCode >= 500 && tries < this.config.maxRetries) {
                                                setTimeout(() => this.attempt(lib, agent, url, method, headers, payload, tries + 1).then(resolve, reject), 250 * (tries + 1));
                                                return;
                                        }
                                        resolve({ status: res.statusCode, text });
                                });
                        });
                        req.on("timeout", () => {
                                req.destroy(new Error("Request timed out"));
                        });
                        req.on("error", err => {
                                if (tries < this.config.maxRetries) {
                                        setTimeout(() => this.attempt(lib, agent, url, method, headers, payload, tries + 1).then(resolve, reject), 250 * (tries + 1));
                                        return;
                                }
                                reject(err);
                        });
                        if (payload) req.write(payload);
                        req.end();
                });
        }

        close() {
                this.agents.http.destroy();
                this.agents.https.destroy();
        }
}

/**
 * Normalize a value into the appState array the server expects. Accepts an
 * appState array ({key|name, value}), a `sessionid=...; ds_user_id=...` cookie
 * header string, or a Netscape cookies.txt export.
 */
function normalizeAppState(input) {
        if (Array.isArray(input)) {
                return input
                        .map(c => ({ key: c.key || c.name, value: c.value }))
                        .filter(c => c.key && c.value !== undefined && c.value !== "");
        }
        if (typeof input === "string") {
                if (input.includes("\t")) {
                        return input.split("\n")
                                .map(line => line.split("\t"))
                                .filter(f => f.length >= 7)
                                .map(f => ({ key: f[5].trim(), value: f[6].trim() }))
                                .filter(c => c.key && c.value);
                }
                return input.split(";")
                        .map(part => {
                                const i = part.indexOf("=");
                                return { key: (part.slice(0, i) || "").trim(), value: (part.slice(i + 1) || "").trim() };
                        })
                        .filter(c => c.key && c.value && c.key !== "x-referer");
        }
        return [];
}

/**
 * Offline liveness check. Without an Instagram request the best we can assert is
 * that a usable session cookie is present. Used as a fallback when the client is
 * not pointed at a server (e.g. the bot wiring the package as a local `file:`).
 */
function looksLikeSession(appState) {
        const cookies = normalizeAppState(appState);
        return cookies.some(c => c.key === "sessionid" || c.key === "authorization");
}

module.exports = { Transport, mapError, CODES, normalizeAppState, looksLikeSession };
