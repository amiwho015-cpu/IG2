import { AuthenticationError, ValidationError } from '../../shared/errors.js';

export const IG_APP_ID = '936619743392459';
const BASE_URL = 'https://www.instagram.com';
const TRUSTED_HOSTS = new Set(['www.instagram.com']);
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function requestUrl(path, query) {
  const url = new URL(path, BASE_URL);
  if (url.protocol !== 'https:' || !TRUSTED_HOSTS.has(url.hostname) || url.port || url.username || url.password) {
    throw new ValidationError('Authenticated HTTP requests must target a trusted Instagram HTTPS host.');
  }
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url;
}

function encodeForm(form) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(form)) {
    if (value !== undefined && value !== null) body.set(key, String(value));
  }
  return body;
}

export function buildRequest(method, path, { query, form, data, headers = {}, profile = 'web' } = {}, { cookies, csrfToken }) {
  if (profile !== 'web') throw new ValidationError('Only the Instagram web request profile is supported.');
  const url = requestUrl(path, query);
  const defaults = {
    'user-agent': USER_AGENT,
    accept: '*/*',
    origin: BASE_URL,
    referer: `${BASE_URL}/`,
    'x-ig-app-id': IG_APP_ID,
    'x-asbd-id': '129477',
    'x-ig-www-claim': '0',
    'x-requested-with': 'XMLHttpRequest',
  };
  const requestHeaders = new Headers({ ...defaults, ...headers });
  requestHeaders.set('cookie', cookies);
  requestHeaders.set('x-csrftoken', csrfToken);

  let body = data;
  if (form) {
    body = encodeForm(form);
    requestHeaders.set('content-type', 'application/x-www-form-urlencoded');
  }
  return { url, options: { method, headers: requestHeaders, body, redirect: 'manual' } };
}

export function sessionForm(session, requestNumber, extra = {}) {
  if (!session) throw new AuthenticationError('Initialize a session before calling this API.');
  return {
    fb_dtsg: session.fb_dtsg,
    jazoest: session.jazoest,
    __a: 1,
    __user: session.IGSID,
    __req: requestNumber.toString(36),
    __rev: session.clientRevision,
    av: session.IGSID,
    ...extra,
  };
}

export function graphqlForm(docId, variables, friendlyName) {
  if (!/^\d+$/.test(String(docId))) throw new ValidationError('GraphQL docId must contain digits.');
  return {
    __user: '0',
    __d: 'www',
    __jssesw: '1',
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: friendlyName,
    server_timestamps: 'true',
    doc_id: String(docId),
    variables: JSON.stringify(variables),
  };
}
