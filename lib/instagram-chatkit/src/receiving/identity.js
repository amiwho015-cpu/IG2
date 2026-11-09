import { parseCookies } from '../shared/cookies.js';
import { ConnectionError } from '../shared/errors.js';

export function messageIdentity(client) {
  const cookies = parseCookies(client?.session?.cookieIGS ?? '');
  return JSON.stringify([cookies.get('ds_user_id') ?? '', cookies.get('sessionid') ?? '']);
}

export function assertMessageIdentity(client, identity) {
  if (client?.closed === true) throw new ConnectionError('Client is closed.', { code: 'CLOSED', retryable: false });
  if (messageIdentity(client) !== identity) {
    throw new ConnectionError('The message belongs to a previous account session.', { code: 'SESSION_CHANGED', retryable: false });
  }
}
