import { ValidationError } from './errors.js';

export function id(value, name = 'id', { numeric = true } = {}) {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
    throw new ValidationError(`${name} must be a safe integer or a string.`);
  }
  if (!['string', 'number', 'bigint'].includes(typeof value)) {
    throw new ValidationError(`${name} is required.`);
  }

  const result = String(value).trim();
  if (!result || (numeric && !/^\d+$/.test(result))) {
    throw new ValidationError(`${name} must be a numeric ID.`);
  }
  return result;
}

export function text(value, name = 'text', { empty = false, max = Infinity } = {}) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || [...value].length > max) {
    const description = empty ? 'a string' : 'a nonempty string';
    const limit = max < Infinity ? ` of at most ${max} characters` : '';
    throw new ValidationError(`${name} must be ${description}${limit}.`);
  }
  return value;
}

export function boolean(value, name) {
  if (typeof value !== 'boolean') throw new ValidationError(`${name} must be a boolean.`);
  return value;
}

export function boundedInteger(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

export function positiveId(value, name = 'id') {
  const result = id(value, name);
  if (BigInt(result) <= 0n) throw new ValidationError(`${name} must be a positive numeric ID.`);
  return result;
}
