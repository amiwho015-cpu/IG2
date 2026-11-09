import { ValidationError } from './errors.js';
import { parseCookies } from './cookies.js';

export function validateSessionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      ![1, 2].includes(snapshot.version) || typeof snapshot.cookies !== 'string') {
    throw new ValidationError('Unsupported session snapshot.');
  }
  const cookies = parseCookies(snapshot.cookies);
  const accountPk = cookies.get('ds_user_id');
  if (accountPk !== undefined && !/^[1-9]\d{0,511}$/.test(accountPk)) {
    throw new ValidationError('Invalid session account identity.');
  }
  return { version: 2, cookies: snapshot.cookies };
}
