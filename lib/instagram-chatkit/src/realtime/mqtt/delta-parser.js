import { ValidationError } from '../../shared/errors.js';
import { parseIrisMessage, parseReactions } from '../../shared/message-parser.js';
import { integer, parseJson } from '../wire-format.js';

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

function parsePayload(raw, maxPayloadBytes) {
  if ((!['string'].includes(typeof raw) && !(raw instanceof Uint8Array)) ||
      !Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes <= 0 || Buffer.byteLength(raw) > maxPayloadBytes) {
    throw new ValidationError('MQTT payload is invalid or exceeds the size limit.');
  }
  try { return parseJson(Buffer.from(raw).toString('utf8')); }
  catch { throw new ValidationError('MQTT payload is not valid JSON.'); }
}

export function parseControlPayload(raw, maxPayloadBytes = 4 * 1024 * 1024) {
  const result = parsePayload(raw, maxPayloadBytes);
  if (!object(result)) throw new ValidationError('Invalid Iris control payload.');
  return result;
}

export function parseDeltaPayload(raw, maxPayloadBytes = 4 * 1024 * 1024) {
  const events = parsePayload(raw, maxPayloadBytes);
  if (!Array.isArray(events) || events.length > 1000) throw new ValidationError('Invalid Iris patch batch.');
  const envelopes = [];
  for (const event of events) {
    if (!object(event) || typeof event.event !== 'string') throw new ValidationError('Invalid Iris envelope.');
    if (event.event !== 'patch') continue;
    const sequence = integer(event.seq_id, 'Iris sequence').toString();
    if (!Array.isArray(event.data) || event.data.length > 1000) throw new ValidationError('Invalid Iris patch list.');
    if (event.mutation_token != null && typeof event.mutation_token !== 'string') throw new ValidationError('Invalid Iris mutation token.');
    const deltas = event.data.map(delta => {
      if (!object(delta) || typeof delta.op !== 'string' || !['add', 'replace', 'remove'].includes(delta.op) ||
          typeof delta.path !== 'string' || !delta.path.startsWith('/') || delta.path.length > 4096) {
        throw new ValidationError('Invalid Iris patch operation.');
      }
      let value = delta.value;
      if (typeof value === 'string') {
        try {
          const parsed = parseJson(value);
          if (!delta.path.endsWith('/text') || typeof parsed === 'string') value = parsed;
        } catch {}
      }
      return { op: delta.op, path: delta.path, value, sequence, mutationToken: event.mutation_token ?? null };
    });
    envelopes.push({ sequence, deltas });
  }
  return envelopes;
}

function timestampMs(value) {
  try { return Number(integer(value, 'timestamp', { max: 9223372036854775807n }) / 1000n); }
  catch { return undefined; }
}

export function normalizeDelta(delta) {
  if (!object(delta) || !['add', 'replace', 'remove'].includes(delta.op)) return null;
  const thread = /^\/direct_v2\/inbox\/threads\/([1-9]\d{0,511})$/.exec(delta.path);
  if (thread && (delta.op === 'remove' || object(delta.value))) {
    return { type: 'threadUpdate', data: { id: thread[1], threadId: thread[1], nativeThreadId: thread[1],
      change: delta.op, raw: delta.value } };
  }
  if (delta.path === '/direct_v2/inbox/unseen_count' && delta.op !== 'remove') {
    const count = object(delta.value) ? delta.value.count : delta.value;
    if (Number.isSafeInteger(count) && count >= 0) return { type: 'unseenCount', data: { count, raw: delta.value } };
    return null;
  }
  const read = /^\/direct_v2\/threads\/([1-9]\d{0,511})\/last_seen_at\/([1-9]\d{0,511})$/.exec(delta.path);
  if (read && delta.op !== 'remove' && object(delta.value) &&
      typeof delta.value.item_id === 'string' && /^[A-Za-z0-9._$:-]{1,512}$/.test(delta.value.item_id)) {
    return { type: 'readReceipt', data: { id: delta.value.item_id, itemId: delta.value.item_id,
      messageId: delta.value.item_id, threadId: read[1], nativeThreadId: read[1], senderId: read[2],
      timestampMs: timestampMs(delta.value.timestamp), raw: delta.value } };
  }
  const match = /^\/direct_v2\/threads\/([1-9]\d{0,511})\/items\/([A-Za-z0-9._$:-]{1,512})(?:\/(text|reactions))?$/.exec(delta.path);
  if (!match) return null;
  const [, nativeThreadId, itemId, property] = match;
  const identity = { id: itemId, messageId: itemId, itemId, threadId: nativeThreadId, nativeThreadId, nativeDirect: true };
  if (property === 'text') {
    if (!['add', 'replace'].includes(delta.op) || typeof delta.value !== 'string' || delta.value.length > 100_000) return null;
    return { type: 'messageEdit', data: { ...identity, newText: delta.value } };
  }
  if (property === 'reactions') {
    if (delta.op !== 'remove' && (!object(delta.value) ||
        !['likes', 'emojis'].some(key => Array.isArray(delta.value[key])))) return null;
    return { type: 'reaction', data: { ...identity, reactions: parseReactions(delta.value),
      change: delta.op === 'remove' ? 'remove' : 'replace', raw: delta.value } };
  }
  if (delta.op === 'remove') {
    return { type: 'messageUnsend', data: identity };
  }
  if (!['add', 'replace'].includes(delta.op) || !object(delta.value)) return null;
  const message = parseIrisMessage(delta.value, { nativeThreadId, itemId });
  return message ? { type: 'message', data: message } : null;
}
