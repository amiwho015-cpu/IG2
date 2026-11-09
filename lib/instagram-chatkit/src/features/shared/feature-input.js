import { ValidationError } from '../../shared/errors.js';
import { id, text } from '../../shared/validation.js';

export function opaqueId(value, name = 'id') {
  const result = id(value, name, { numeric: false });
  if (result.length > 256 || !/^[A-Za-z0-9:_-]+$/.test(result)) throw new ValidationError(`${name} contains unsupported characters.`);
  return result;
}

export function pathId(value, name = 'id') { return encodeURIComponent(opaqueId(value, name)); }

export function idList(values, name = 'ids', maximum = 100) {
  if (!Array.isArray(values) || !values.length || values.length > maximum) throw new ValidationError(`${name} must contain 1–${maximum} IDs.`);
  return [...new Set(values.map(value => opaqueId(value, name)))];
}

export function pageQuery(maxId = null, extra = {}) {
  const query = { ...extra };
  if (maxId !== null && maxId !== undefined) {
    if (!['string', 'number', 'bigint'].includes(typeof maxId) || (typeof maxId === 'number' && !Number.isSafeInteger(maxId))) throw new ValidationError('maxId must be a string or safe integer.');
    query.max_id = text(String(maxId), 'maxId', { max: 1024 }).trim();
  }
  return query;
}

export function hashtag(value) {
  const tag = text(value, 'hashtag', { max: 100 }).trim().replace(/^#/, '');
  if (!/^[\p{L}\p{M}\p{N}_]+$/u.test(tag)) throw new ValidationError('hashtag must contain letters, digits or underscores.');
  return tag;
}

export function coordinates(lat, lng, { optional = false } = {}) {
  if (optional && lat == null && lng == null) return {};
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90 || typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new ValidationError('latitude/longitude must both be finite numbers in geographic range.');
  }
  return { latitude: lat, longitude: lng };
}
