import { parseCookies } from '../shared/cookies.js';
import { ValidationError } from '../shared/errors.js';

export function validateStoredCookies(cookies) {
  if (typeof cookies !== 'string' || !cookies.trim() || !parseCookies(cookies).size) {
    throw new ValidationError('Cookies must contain at least one name=value pair.');
  }
}
