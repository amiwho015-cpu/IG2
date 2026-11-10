"use strict";

/**
 * Configuration + Instagram cookie loading.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
// IG_CONFIG_PATH lets tests (and unusual deployments) point at a scratch config
// instead of the repo's config.json — otherwise a command that calls saveConfig
// (e.g. `prefix`) would overwrite the operator's real file during a test run.
// Resolved per call so the override can be set at any time.
function configPathFor() {
	return process.env.IG_CONFIG_PATH
		? path.resolve(process.env.IG_CONFIG_PATH)
		: path.join(ROOT, "config.json");
}
function accountPathFor() {
	return process.env.IG_ACCOUNT_PATH
		? path.resolve(process.env.IG_ACCOUNT_PATH)
		: path.join(ROOT, "account.txt");
}
const accountPath = accountPathFor();

function readJSON(file) {
	const raw = fs.readFileSync(file, "utf8");
	try {
		return JSON.parse(raw);
	}
	catch (error) {
		throw new Error(`Invalid JSON in ${path.basename(file)}: ${error.message}`);
	}
}

function loadConfig() {
	if (!fs.existsSync(configPathFor()))
		throw new Error("config.json not found");
	const config = readJSON(configPathFor());

	config.botName = config.botName || "InstaBOT";
	config.prefix = typeof config.prefix === "string" ? config.prefix : "-";
	config.language = config.language || "en";
	// Bot admins are the accounts allowed to run admin-only commands. They are
	// per-deployment, never baked into the repo: set them in config.json, or in
	// the environment as a comma-separated IG_ADMIN_BOT (it wins).
	config.adminBot = Array.isArray(config.adminBot) ? config.adminBot.map(String).filter(Boolean) : [];
	if (process.env.IG_ADMIN_BOT && process.env.IG_ADMIN_BOT.trim()) {
		config.adminBot = process.env.IG_ADMIN_BOT.split(",").map(s => s.trim()).filter(Boolean);
	}
	config.whiteList = config.whiteList || { enable: false, userIDs: [], threadIDs: [] };
	config.whiteList.userIDs = (config.whiteList.userIDs || []).map(String);
	config.whiteList.threadIDs = (config.whiteList.threadIDs || []).map(String);
	config.onlineStatus = config.onlineStatus || {};
	config.database = config.database || {};
	config.database.dir = config.database.dir || "data";

	// These are read unconditionally by the dispatcher, so guarantee their shape
	// even when an operator trims them out of config.json.
	config.hideNotiMessage = config.hideNotiMessage || {};
	config.adminOnly = config.adminOnly || {};
	config.adminOnly.enable = config.adminOnly.enable === true;
	config.adminOnly.ignoreCommands = Array.isArray(config.adminOnly.ignoreCommands)
		? config.adminOnly.ignoreCommands.map(String)
		: [];
	config.cooldown = config.cooldown || {};
	config.cooldown.default = Number(config.cooldown.default) || 0;
	config.logEvents = config.logEvents || {};
	config.antiInbox = config.antiInbox === true;
	config.noPrefix = config.noPrefix === true;

	// Optional secrets/endpoints for custom commands.
	//
	// Only the namespaced INSTABOT_* variables are read: hosts like Render set a
	// bare `URL` (the service's own public URL) and `PORT`, and picking those up
	// as an API endpoint silently broke commands (e.g. `sing` hitting the bot's
	// own host and getting a 404).
	config.env = config.env || {};
	config.env.token = process.env.INSTABOT_TOKEN || config.env.token || "";
	config.env.url = process.env.INSTABOT_URL || config.env.url || "";

	// Music: blank apiUrl means "use Instagram's own catalogue". NEVER fall back
	// to env.url — that is not a music server, and a host like Render/Railway
	// that sets URL/INSTABOT_URL for its own service would make `sing` query the
	// bot's own host and get a 404.
	config.music = config.music || {};
	config.music.enable = config.music.enable !== false;
	config.music.apiUrl = config.music.apiUrl || "";
	config.music.apiToken = config.music.apiToken || "";

	// Private ig-chat-api server.
	//
	// The environment WINS over config.json. This is deliberate: a forked repo
	// can carry a committed `server.url` from whoever published it, and a
	// deployment must always be able to point at its own server. Before, the
	// file value took priority, so everyone who forked and set IG_API_SERVER in
	// their host dashboard still connected to the original author's server (and
	// therefore to that author's Instagram account).
	config.server = config.server || {};
	config.server.url = process.env.IG_API_SERVER || config.server.url || "";
	config.server.token = process.env.IG_API_TOKEN || config.server.token || "";
	// There is deliberately no bot id to configure. The server identifies each
	// session by the account's own Instagram id, and the bot learns its id from
	// the server's /cookies reply (see auth.js). Any legacy botId in config.json
	// / IG_BOT_ID is ignored.
	delete config.server.botId;
	config.server.timeout = Number(config.server.timeout) || 60000;
	// "direct" = log in with the local ig-chat-api package (like Insta-Bot3);
	// anything else = use the hosted server above. IG_MODE overrides the file.
	// The old hosted ICA server is dead, so every deploy uses the built-in instagram-chatkit (lib/instagram-chatkit)
	// no matter what stale IG_MODE / IG_API_SERVER variables or config.json say.
	// Only IG_FORCE_MODE=1 lets IG_MODE (or config.server.mode) pick "direct" / "server".
	const modeEnv = process.env.IG_MODE && process.env.IG_MODE.trim().toLowerCase();
	const fileMode = String(config.server.mode || "").toLowerCase();
	const validModes = ["chatkit", "ica", "instachat", "direct", "server"];
	const forced = process.env.IG_FORCE_MODE === "1";
	config.server.mode = forced ? (validModes.includes(modeEnv) ? modeEnv : (validModes.includes(fileMode) ? fileMode : "chatkit")) : "chatkit";
	// instachat-api (vendored in lib/instachat-api): polling + send throttle settings.
	const ic = config.instachat && typeof config.instachat === "object" ? config.instachat : {};
	config.instachat = ic;
	if (!(Number(ic.pollIntervalMs) >= 1000)) ic.pollIntervalMs = 2500;
	if (!(Number(ic.idlePollIntervalMs) >= 1000)) ic.idlePollIntervalMs = 8000;
	if (ic.adaptivePolling == null) ic.adaptivePolling = true;
	if (ic.throttle !== false) {
		ic.throttle = ic.throttle && typeof ic.throttle === "object" ? ic.throttle : {};
		if (ic.throttle.minGapMs == null) ic.throttle.minGapMs = 450;
		if (ic.throttle.perThreadGapMs == null) ic.throttle.perThreadGapMs = 700;
		if (ic.throttle.jitterMs == null) ic.throttle.jitterMs = 150;
	}
	config.optionsFca = config.optionsFca && typeof config.optionsFca === "object" ? config.optionsFca : {};

	// Typing indicator shown before the bot sends anything (toggle: `typingindicator`).
	config.typingIndicator = config.typingIndicator || {};
	if (config.typingIndicator.enable == null) config.typingIndicator.enable = true;
	if (!(Number(config.typingIndicator.duration) > 0)) config.typingIndicator.duration = 400;

	// Welcome / leave announcements for group threads.
	config.welcome = config.welcome || {};
	if (config.welcome.enable == null) config.welcome.enable = true;
	if (!config.welcome.message) config.welcome.message = "Welcome %1 to %2! 👋";
	if (!Array.isArray(config.welcome.threadIDs)) config.welcome.threadIDs = [];

	// Anyone who swears at the bot gets `warnLimit` warnings, then is banned from using it.
	config.abuse = config.abuse || {};
	if (config.abuse.enable == null) config.abuse.enable = true;
	if (!Number.isInteger(config.abuse.warnLimit) || config.abuse.warnLimit < 1) config.abuse.warnLimit = 2;
	if (!config.abuse.reason) config.abuse.reason = "you are biggest motherchod";
	if (!Array.isArray(config.abuse.extraWords)) config.abuse.extraWords = [];
	if (config.abuse.threadIDs != null && !Array.isArray(config.abuse.threadIDs)) config.abuse.threadIDs = [];

	config.leave = config.leave || {};
	if (config.leave.enable == null) config.leave.enable = true;
	if (!config.leave.message) config.leave.message = "%1 left %2. 👋";
	if (!Array.isArray(config.leave.threadIDs)) config.leave.threadIDs = [];

	return config;
}

function saveConfig(config) {
	fs.writeFileSync(configPathFor(), JSON.stringify(config, null, "\t") + "\n");
}

function isNetScapeCookie(text) {
	// Netscape cookie jars have seven tab-separated columns. FALSE is valid too.
	return String(text).split(/\r?\n/).some(rawLine => {
		const line = rawLine.trim();
		if (!line || (line.startsWith("#") && !/^#HttpOnly_/i.test(line))) return false;
		const fields = line.replace(/^#HttpOnly_/i, "").split("\t");
		return fields.length >= 7 &&
			/^(?:TRUE|FALSE|1|0)$/i.test(fields[1]) &&
			/^(?:TRUE|FALSE|1|0)$/i.test(fields[3]) &&
			/^\d+$/.test(fields[4]) &&
			!!fields[5];
	});
}

function netScapeToCookies(text) {
	const cookies = [];
	for (const rawLine of String(text).split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || (line.startsWith("#") && !/^#HttpOnly_/i.test(line))) continue;
		const fields = line.replace(/^#HttpOnly_/i, "").split("\t");
		if (fields.length < 7 || !fields[5]) continue;
		cookies.push({
			key: fields[5].trim(),
			value: fields.slice(6).join("\t").trim(),
			domain: fields[0].replace(/^\./, "").trim() || "instagram.com",
			path: fields[2].trim() || "/"
		});
	}
	return cookies;
}

function cookieHeaderToCookies(text) {
	const source = String(text)
		.replace(/^\s*(?:cookie\s*:)\s*/i, "")
		.replace(/\r\n?/g, "\n")
		.replace(/\n(?=[\w.-]+\s*=)/g, ";");
	return source.split(";")
		.map(part => part.trim())
		.filter(Boolean)
		.map(part => {
			const index = part.indexOf("=");
			if (index < 1) return null;
			return {
				key: part.slice(0, index).trim(),
				value: part.slice(index + 1).trim(),
				domain: "instagram.com",
				path: "/"
			};
		})
		.filter(Boolean);
}

function objectToCookieList(obj) {
	if (!obj || typeof obj !== "object") return [];
	// Common browser/Playwright/Puppeteer cookie export property names.
	for (const key of ["cookies", "cookie", "appState", "session", "sessionData", "data", "storageState"]) {
		if (obj[key] !== undefined) {
			const nested = obj[key];
			if (Array.isArray(nested)) return nested;
			if (nested && typeof nested === "object") return objectToCookieList(nested);
			if (typeof nested === "string") {
				try { return objectToCookieList(JSON.parse(nested)); } catch (_) {}
			}
		}
	}
	// Cookie extension exports often use {name: value} or {name: {value, domain}}.
	return Object.entries(obj).map(([key, value]) => {
		if (value && typeof value === "object") return Object.assign({ key, name: key }, value);
		return { key, name: key, value };
	});
}

function normalizeCookies(list) {
	return (Array.isArray(list) ? list : [])
		.map(item => {
			if (!item || typeof item !== "object") return null;
			const key = item.key || item.name;
			return key ? { key, value: item.value, domain: item.domain || "instagram.com", path: item.path || "/" } : null;
		})
		.filter(item => item && item.key && item.value !== undefined);
}

/**
 * Parse account.txt into an Instagram cookie list.
 * Accepts: JSON array, JSON object, cookie header string, Netscape file.
 */
function parseAccountText(rawText) {
	let text = String(rawText || "").trim();
	if (!text) throw new Error("Instagram cookie input is empty");

	let cookies = [];
	// Netscape / Mozilla cookie.txt
	if (isNetScapeCookie(text)) {
		cookies = netScapeToCookies(text);
	}
	// JSON arrays, JSON objects, nested session exports, and JSON strings.
	else if (/^[\[{"']/.test(text)) {
		let parsed;
		try {
			parsed = JSON.parse(text);
		}
		catch (error) {
			throw new Error(`Instagram cookie JSON is invalid: ${error.message}`);
		}
		for (let depth = 0; depth < 5 && typeof parsed === "string"; depth++) {
			try { parsed = JSON.parse(parsed); } catch (_) { break; }
		}
		cookies = Array.isArray(parsed) ? parsed : objectToCookieList(parsed);
		cookies = normalizeCookies(cookies);
	}
	// Raw Cookie header or newline-separated NAME=VALUE pairs.
	else {
		cookies = cookieHeaderToCookies(text);
	}

	cookies = normalizeCookies(cookies);
	const has = key => cookies.some(cookie => cookie.key.toLowerCase() === key.toLowerCase());
	if (!has("sessionid") || !(has("ds_user_id") || has("userid")))
		throw new Error(
			"Instagram cookies are incomplete. The imported format was read, but it must include both `sessionid` and `ds_user_id` (or `userid`)."
		);
	return cookies;
}

function loadAccount() {
	// IG_COOKIES is the canonical Railway/Render variable. The aliases allow
	// common existing deployments to migrate without renaming their secret.
	const envNames = ["IG_COOKIES", "IG_SESSION_JSON", "SESSION_JSON", "INSTAGRAM_COOKIES"];
	let fromEnv = "";
	for (const name of envNames) {
		if (typeof process.env[name] === "string" && process.env[name].trim()) {
			fromEnv = process.env[name].trim();
			break;
		}
	}
	if (!fromEnv && !fs.existsSync(accountPathFor()))
		throw new Error(
			"No Instagram cookies found. Add a Railway variable named IG_COOKIES (recommended), " +
			"or IG_SESSION_JSON / SESSION_JSON / INSTAGRAM_COOKIES. The variable must contain cookies " +
			"including sessionid and ds_user_id. Alternatively create account.txt."
		);
	return parseAccountText(fromEnv || fs.readFileSync(accountPathFor(), "utf8"));
}

module.exports = {
	parseAccountText,
	loadAccountFromEnv: parseAccountText,
	ROOT,
	get configPath() { return configPathFor(); },
	get accountPath() { return accountPathFor(); },
	loadConfig,
	saveConfig,
	loadAccount,
	normalizeCookies,
	netScapeToCookies,
	cookieHeaderToCookies,
	isNetScapeCookie
};
