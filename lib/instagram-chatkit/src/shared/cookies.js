import { ValidationError } from './errors.js';

export function parseCookies(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ValidationError('Cookies must be a string without control characters.');
  }
  const cookies = new Map();
  for (const part of value.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(name)) throw new ValidationError('Invalid cookie name.');
    cookies.set(name, part.slice(index + 1).trim());
  }
  return cookies;
}

export function serializeCookies(cookies) {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
}

export function mergeResponseCookies(cookies, headers) {
  for (const line of headers.getSetCookie?.() ?? []) {
    const [pair, ...attributes] = line.split(';');
    const entry = parseCookies(pair).entries().next().value;
    if (!entry) continue;
    const [name, value] = entry;
    const maxAge = attributes.map(attribute => /^\s*max-age\s*=\s*(-?\d+)\s*$/i.exec(attribute)?.[1]).find(value => value !== undefined);
    const expires = attributes.map(attribute => /^\s*expires\s*=\s*(.*)$/i.exec(attribute)?.[1]).find(value => value !== undefined);
    const expired = maxAge !== undefined ? BigInt(maxAge) <= 0n : expires !== undefined && Date.parse(expires) <= Date.now();
    if (expired) cookies.delete(name);
    else cookies.set(name, value);
  }
}
