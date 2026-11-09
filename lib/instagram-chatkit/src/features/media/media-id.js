import { ValidationError } from '../../shared/errors.js';
import { id } from '../../shared/validation.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function mediaId(target) {
  let value = id(target, 'post', { numeric: false });
  if (/^\d+(?:_\d+)?$/.test(value)) {
    if (!/^[1-9]\d*(?:_[1-9]\d*)?$/.test(value)) {
      throw new ValidationError('mediaId must be a positive ID or an ID_ownerId pair.');
    }
    return value;
  }
  if (/^https?:\/\//i.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new ValidationError('Invalid Instagram post URL.');
    }
    if (!['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.username || url.password || url.port) {
      throw new ValidationError('The post URL must belong to instagram.com.');
    }
    const match = /^\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
    if (!match) throw new ValidationError('Unsupported Instagram post URL.');
    value = match[1];
  }
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new ValidationError('Invalid Instagram shortcode.');

  let number = 0n;
  for (const character of value) number = number * 64n + BigInt(ALPHABET.indexOf(character));
  if (number <= 0n) throw new ValidationError('Invalid Instagram shortcode.');
  return number.toString();
}
