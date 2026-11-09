import { parseCookies } from '../shared/cookies.js';
import { positiveId, text } from '../shared/validation.js';
import { ValidationError } from '../shared/errors.js';

function predicate(value) {
  if (typeof value !== 'function') throw new ValidationError('A message filter must be a function.');
  return value;
}

function mediaTypes(message) {
  return [message?.media, ...(Array.isArray(message?.attachments) ? message.attachments : [])]
    .filter(value => value && typeof value === 'object')
    .map(value => value.type ?? value.mediaType ?? value.media_type);
}

const hasMedia = (...types) => message => mediaTypes(message).some(value => types.includes(value));
const self = (message, client) => {
  if (message?.fromMe === true || message?.isSentByViewer === true) return true;
  const viewer = parseCookies(client?.session?.cookieIGS ?? '').get('ds_user_id');
  return Boolean(viewer && String(message?.senderId) === viewer);
};

async function groupFlag(message) {
  if (typeof message?.isGroup === 'boolean') return message.isGroup;
  let thread = message?.thread;
  if (!thread && typeof message?.getThread === 'function') thread = await message.getThread();
  return typeof thread?.isGroup === 'boolean' ? thread.isGroup : thread?.is_group;
}

function all(...values) {
  const tests = values.map(predicate);
  return async (message, client) => {
    for (const test of tests) if (!await test(message, client)) return false;
    return true;
  };
}

function any(...values) {
  const tests = values.map(predicate);
  return async (message, client) => {
    for (const test of tests) if (await test(message, client)) return true;
    return false;
  };
}

function regex(value, flags) {
  if (!(value instanceof RegExp) && typeof value !== 'string') throw new ValidationError('regex requires a RegExp or pattern string.');
  let pattern;
  try { pattern = value instanceof RegExp ? new RegExp(value.source, value.flags) : new RegExp(value, flags); }
  catch { throw new ValidationError('Invalid message filter regular expression.'); }
  return message => {
    pattern.lastIndex = 0;
    return pattern.test(typeof message?.text === 'string' ? message.text : '');
  };
}

function command(names, { prefix = '/', caseSensitive = false } = {}) {
  text(prefix, 'prefix', { max: 20 });
  if (prefix.trim() !== prefix || typeof caseSensitive !== 'boolean') throw new ValidationError('Invalid command filter options.');
  const values = Array.isArray(names) ? names : [names];
  if (!values.length || values.some(name => typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(name))) {
    throw new ValidationError('command requires command names without their prefix.');
  }
  const selected = new Set(values.map(name => caseSensitive ? name : name.toLowerCase()));
  return message => {
    if (typeof message?.text !== 'string' || !message.text.startsWith(prefix)) return false;
    const name = message.text.slice(prefix.length).trim().split(/\s+/, 1)[0] || 'help';
    return selected.has(caseSensitive ? name : name.toLowerCase());
  };
}

export const filters = Object.freeze({
  text: message => typeof message?.text === 'string' && message.text.length > 0,
  photo: hasMedia('photo', 'image'), video: hasMedia('video'), voice: hasMedia('voice_media', 'voice'),
  gif: hasMedia('animated_media', 'gif'), reel: hasMedia('clip', 'reel'), post: hasMedia('media_share', 'post'),
  link: message => message?.itemType === 'link' || mediaTypes(message).includes('link'),
  like: message => message?.itemType === 'like',
  media: message => mediaTypes(message).some(type => typeof type === 'string' && type !== 'link' && type !== 'like'),
  self, me: self, incoming: (message, client) => !self(message, client),
  private: async message => await groupFlag(message) === false,
  group: async message => await groupFlag(message) === true,
  all, any,
  not: value => { const test = predicate(value); return async (message, client) => !await test(message, client); },
  create: predicate,
  chat: value => {
    const id = positiveId(value, 'threadId');
    return message => String(message?.nativeThreadId ?? message?.threadId ?? '') === id;
  },
  fromUser: value => {
    const id = positiveId(value, 'senderId');
    return message => String(message?.senderId ?? '') === id;
  },
  regex, command,
});
