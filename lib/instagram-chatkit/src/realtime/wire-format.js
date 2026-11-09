import { ValidationError } from '../shared/errors.js';

export function parseJson(text) {
  return JSON.parse(text, (_key, value, context) => {
    if (typeof value === 'number' && !Number.isSafeInteger(value) && /^-?\d+$/.test(context.source)) {
      return context.source;
    }
    return value;
  });
}

export function stringifyJson(value) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? JSON.rawJSON(item.toString()) : item);
}

export function integer(value, name, { min = 0n, max = 9223372036854775807n } = {}) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new ValidationError(`${name} must be a safe integer, decimal string or bigint.`);
  }
  if (!['number', 'string', 'bigint'].includes(typeof value) || !/^-?\d+$/.test(String(value))) {
    throw new ValidationError(`${name} must be an integer.`);
  }
  const result = BigInt(value);
  if (result < min || result > max) throw new ValidationError(`${name} is out of range.`);
  return result;
}

