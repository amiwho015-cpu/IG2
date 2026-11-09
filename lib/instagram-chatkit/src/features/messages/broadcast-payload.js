import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../shared/errors.js';
import { boolean, positiveId, text } from '../../shared/validation.js';
import { recipientIds } from '../threads/thread-identifiers.js';

const protectedFields = new Set([
  'action', 'thread_ids', 'recipient_users', 'client_context', 'mutation_token',
  '_csrftoken', '_uuid', '_uid', 'device_id', 'signed_body', 'ig_sig_key_version',
  '__proto__', 'constructor', 'prototype',
]);

export function mutationContext(value) {
  return value === undefined ? randomUUID() : text(value, 'clientContext', { max: 128 });
}

export function broadcastPayload({ threadIds, userIds, item, form = {}, signed = false, clientContext } = {}) {
  const hasThreads = threadIds !== undefined && threadIds !== null;
  const hasUsers = userIds !== undefined && userIds !== null;
  if (hasThreads === hasUsers) throw new ValidationError('Provide exactly one of threadIds or userIds.');
  const recipients = recipientIds(hasThreads ? threadIds : userIds, hasThreads ? 'threadIds' : 'userIds');
  const type = text(item, 'item', { max: 64 });
  if (!/^[a-z][a-z0-9_]*$/.test(type)) throw new ValidationError('item must be a Direct broadcast item type.');
  boolean(signed, 'signed');
  if (!form || typeof form !== 'object' || Array.isArray(form)) throw new ValidationError('broadcast form must be an object.');
  for (const key of Object.keys(form)) {
    if (protectedFields.has(key)) throw new ValidationError('broadcast form cannot override identity, destinations or mutation context.');
  }
  const fields = { ...form };
  if (type === 'text') text(fields.text, 'message', { max: 10000 });
  if (['configure_photo', 'configure_video', 'voice_media'].includes(type)) fields.upload_id = positiveId(fields.upload_id, 'upload_id');
  const context = mutationContext(clientContext);
  const destination = hasThreads
    ? { thread_ids: JSON.stringify(recipients) }
    : { recipient_users: JSON.stringify([recipients]) };
  return {
    type,
    signed,
    fields: { ...fields, action: 'send_item', ...destination, client_context: context, mutation_token: context },
  };
}
