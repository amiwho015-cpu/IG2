/*
 * Author: Tanvir Ahmed (tanvir143)
 * File Name: session.js
 */

'use strict';

const fs = require('node:fs');
const { CookieJar } = require('tough-cookie');
const { createDeviceBundle } = require('../core/device');
const { SessionExpired } = require('../exceptions');

const COOKIE_URL = 'https://i.instagram.com';

function normalizeCookies(input) {
  if (Array.isArray(input)) {
    return input;
  }
  if (input && Array.isArray(input.cookies)) {
    return input.cookies;
  }
  return [];
}

function getSession(client) {
  return {
    uuids: client.bundle.uuids,
    mid: client.mid,
    igURur: client.igURur,
    igWwwClaim: client.igWwwClaim,
    authorizationData: client.authorizationData,
    cookieStore: client.http.jar.serializeSync(),
    lastLogin: client.lastLogin || null,
    deviceSettings: client.bundle.deviceSettings,
    userAgent: client.bundle.userAgent,
    locale: client.bundle.locale,
    country: client.bundle.country,
    countryCode: client.bundle.countryCode,
    timezoneOffset: client.bundle.timezoneOffset,
    timezoneName: client.bundle.timezoneName,
    csrftoken: client.bundle.csrftoken,
    fbns_auth: ((client.settings && client.settings.fbns_auth) || client.fbnsAuth) || null,
    usdid: (client.usdid && client.usdid.privateKey) ? {
      usdid: client.usdid.usdid,
      kid: client.usdid.kid,
      private_key: client.usdid.privateKey,
      registered: Boolean(client.usdid.registered),
    } : null,
  };
}

function applySettings(client, settings) {
  client.bundle = createDeviceBundle(settings);
  client.mid = settings.mid || '';
  client.igURur = settings.igURur || '';
  client.igWwwClaim = settings.igWwwClaim || '';
  client.authorizationData = settings.authorizationData || {};
  client.lastLogin = settings.lastLogin || null;
  if (!client.settings) {
    client.settings = {};
  }
  if (settings.fbns_auth) {
    client.settings.fbns_auth = settings.fbns_auth;
    client.fbnsAuth = settings.fbns_auth;
  }
  if (settings.usdid) {
    const { setUsdidSettings } = require('./attestation');
    setUsdidSettings(client, settings.usdid);
  }
  if (settings.cookieStore) {
    client.http.jar = CookieJar.deserializeSync(settings.cookieStore);
  }
}

function saveSession(client, filePath) {
  return saveSettings(client, filePath);
}

function saveSettings(client, filePath) {
  fs.writeFileSync(filePath, JSON.stringify(getSession(client), null, 2));
  return filePath;
}

function loadSettings(client, filePath) {
  applySettings(client, JSON.parse(fs.readFileSync(filePath, 'utf8')));
  return getSession(client);
}

async function loginWithSession(client, options) {
  const opts = options || {};
  const input = opts.session !== undefined ? opts.session : opts.cookies;
  if (input && input.uuids && input.cookieStore) {
    applySettings(client, input);
  } else {
    normalizeCookies(input).forEach((cookie) => {
      const key = cookie.key || cookie.name;
      const value = cookie.value;
      if (key) {
        client.http.jar.setCookieSync(key + '=' + value + '; Domain=.instagram.com; Path=/', COOKIE_URL);
      }
    });
  }
  // Cookie-only login (account.txt / IG_COOKIES): the mobile API needs the
  // Bearer IGT:2 authorization header, which a full Session JSON carries but
  // plain cookies do not. Build it from sessionid + ds_user_id so that the
  // cookies alone are enough.
  if (!client.authorizationData || !client.authorizationData.sessionid) {
    const cookieList = normalizeCookies(input);
    const pick = (name) => {
      const found = cookieList.find((c) => (c.key || c.name) === name);
      return found ? String(found.value) : '';
    };
    let sessionid = pick('sessionid');
    let dsUserId = pick('ds_user_id');
    try { sessionid = decodeURIComponent(sessionid); } catch (e) { /* keep raw */ }
    if (!dsUserId && sessionid) {
      const m = /^(\d+)(?::|%3A)/.exec(sessionid);
      if (m) dsUserId = m[1];
    }
    if (sessionid && dsUserId) {
      client.authorizationData = { ds_user_id: dsUserId, sessionid: sessionid };
    }
    const mid = pick('mid');
    if (mid && !client.mid) client.mid = mid;
  }
  try {
    const user = await client.getCurrentUser();
    if (user && user.username) {
      client.username = user.username;
    }
    if (user && user.pk) {
      client.userId = Number(user.pk);
    }
  } catch (err) {
    const reason = (err && (err.message || err.name)) || 'unknown error';
    throw new SessionExpired('tanvir-mqtt: saved session rejected (' + reason + '); cookies expired? paste fresh sessionid + ds_user_id', {});
  }
  client.lastLogin = Date.now();
  return true;
}

module.exports = { normalizeCookies, getSession, saveSession, saveSettings, loadSettings, applySettings, loginWithSession };