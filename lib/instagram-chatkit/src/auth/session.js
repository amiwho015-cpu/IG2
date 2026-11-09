import { AuthenticationError, ValidationError } from '../shared/errors.js';
import { parseCookies } from '../shared/cookies.js';

const fields = {
  fb_dtsg: [/DTSGInitialData"\s*,\s*\[\]\s*,\s*\{"token":"([^"]+)"/, /"csrf_token":"([^"]+)"/, /LSD"\s*,\s*\[\]\s*,\s*\{"token":"([^"]+)"/],
  fb_dtsg_ag: [/async_get_token":"([^"]+)"/],
  jazoest: [/jazoest=(\d+)/, /"jazoest":"?(\d+)/],
  hash: [/"hash":"([^"]+)"/],
  sessionID: [/"sessionId":"([^"]+)"/, /"session_id":"([^"]+)"/, /"device_id":"([^"]+)"/],
  IGSID: [/"IG_USER_EIMU":"(\d+)"/, /"actorID":"(\d+)"/, /"viewerId":"(\d+)"/, /"ds_user_id":"(\d+)"/, /"NonFBViewerId":"(\d+)"/],
  clientRevision: [/"client_revision"\s*:\s*"?(\d+)/],
};

export function validateSession(session) {
  if (!session || typeof session !== 'object') throw new ValidationError('Session must be an object.');
  for (const field of ['fb_dtsg', 'jazoest', 'sessionID', 'IGSID', 'clientRevision', 'cookieIGS']) {
    if (typeof session[field] !== 'string' || !session[field].trim()) {
      throw new ValidationError(`Session is missing ${field}.`);
    }
  }
  if (!/^\d+$/.test(session.IGSID) || BigInt(session.IGSID) <= 0n || !/^\d+$/.test(session.clientRevision)) {
    throw new ValidationError('Session IDs and revision must be decimal strings.');
  }
  parseCookies(session.cookieIGS);
  return session;
}

export function parseSession(html, cookies) {
  if (typeof html !== 'string') throw new ValidationError('Homepage must be text.');
  if (/"(?:is_logged_in|is_authenticated)"\s*:\s*false/.test(html) || /<form[^>]+action=["'][^"']*accounts\/login/i.test(html)) {
    throw new AuthenticationError();
  }
  const parsedCookies = parseCookies(cookies);
  const session = { cookieIGS: cookies };
  for (const [name, patterns] of Object.entries(fields)) {
    session[name] = patterns.map(pattern => pattern.exec(html)?.[1]).find(Boolean) ?? null;
  }
  if ((!session.IGSID || BigInt(session.IGSID) <= 0n) && !/"(?:is_logged_in|is_authenticated)"\s*:\s*true/.test(html)) {
    throw new AuthenticationError('Homepage did not confirm an authenticated account.');
  }
  session.fb_dtsg ||= parsedCookies.get('csrftoken');
  session.IGSID ||= parsedCookies.get('ds_user_id');
  session.sessionID ||= parsedCookies.get('sessionid');
  if (!session.jazoest && session.fb_dtsg) {
    session.jazoest = '2' + [...session.fb_dtsg].reduce((sum, char) => sum + char.codePointAt(0), 0);
  }
  try { return validateSession(session); }
  catch { throw new AuthenticationError('Homepage is missing session tokens. Refresh cookies or check upstream HTML changes.'); }
}

export async function createSession(http, { signal } = {}) {
  const html = await http.getText('/', { signal });
  return parseSession(html, http.cookies);
}
