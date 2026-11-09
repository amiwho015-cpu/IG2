import { positiveId } from '../shared/validation.js';

export class CommandError extends Error {}

export function required(value, usage) {
  const text = String(value ?? '').trim();
  if (!text) throw new CommandError(`Cách dùng: ${usage}`);
  return text;
}

export function splitArgument(argument) {
  const match = String(argument).trim().match(/^(\S+)(?:\s+([\s\S]*))?$/);
  return match ? [match[1], match[2] ?? ''] : ['', ''];
}

export function parseIds(argument, usage) {
  const values = required(argument, usage).split(/[\s,]+/);
  if (values.some(value => !/^\d+$/.test(value))) throw new CommandError('ID phải là chuỗi chữ số, cách nhau bằng dấu phẩy hoặc khoảng trắng.');
  return values;
}

export function requireThreadId(message) {
  if (message.nativeThreadId) {
    throw new CommandError('Lệnh này cần messaging FBID; thread ID của Instagram Iris không dùng thay FBID.');
  }
  if (!message.threadId || !/^\d+$/.test(message.threadId)) {
    throw new CommandError('Lệnh này cần messaging thread FBID dạng chuỗi chữ số.');
  }
  return message.threadId;
}

export function requireNativeThreadId(message) {
  if (!message.nativeThreadId || !/^[1-9]\d*$/.test(message.nativeThreadId)) {
    throw new CommandError('Lệnh này cần native thread ID của Instagram Iris.');
  }
  return message.nativeThreadId;
}

export async function resolveMessagingThread({ client, message }) {
  if (!message.nativeThreadId) return requireThreadId(message);
  const native = requireNativeThreadId(message);
  if (typeof client.threads?.inbox !== 'function') throw new CommandError('Không thể lấy mapping messaging FBID của cuộc trò chuyện này.');
  const inbox = await client.threads.inbox();
  const matches = Array.isArray(inbox?.threads) ? inbox.threads.filter(thread => thread?.nativeThreadId === native) : [];
  if (matches.length !== 1) throw new CommandError('Inbox chưa trả đúng một messaging FBID cho cuộc trò chuyện này.');
  try { return positiveId(matches[0].id, 'messaging thread FBID'); }
  catch { throw new CommandError('Inbox trả messaging FBID không hợp lệ.'); }
}

export function parseToggle(argument, command) {
  const value = argument.trim().toLowerCase();
  if (!['on', 'off'].includes(value)) throw new CommandError(`Cách dùng: /${command} on hoặc /${command} off.`);
  return value === 'on';
}
