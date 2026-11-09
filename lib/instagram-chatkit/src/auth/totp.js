import { createHmac } from 'node:crypto';
import { ValidationError } from '../shared/errors.js';

export function generateTotp(secret, { now = Date.now(), digits = 6, period = 30 } = {}) {
  if (typeof secret !== 'string') {
    throw new ValidationError('2FA must be an OTP or a Base32 secret.');
  }
  const normalized = secret.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{6,8}$/.test(normalized)) return normalized;
  if (!/^[A-Z2-7]+={0,6}$/.test(normalized) || !Number.isSafeInteger(now) || now < 0 ||
      ![6, 7, 8].includes(digits) || !Number.isSafeInteger(period) || period <= 0) {
    throw new ValidationError('Invalid TOTP parameters.');
  }

  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / period)));
  const digest = createHmac('sha1', decodeBase32(normalized)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits);
  return String(code).padStart(digits, '0');
}

function decodeBase32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const character of secret.replace(/=+$/, '')) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }
  if (!bytes.length) throw new ValidationError('Invalid TOTP secret.');
  return Buffer.from(bytes);
}
