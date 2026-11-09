import { randomBytes } from 'node:crypto';
import { ValidationError } from '../../shared/errors.js';
import { id, positiveId, text } from '../../shared/validation.js';

export function threadingId(now = Date.now()) {
  const randomBits = BigInt(randomBytes(4).readUInt32BE()) & 0x3fffffn;
  return ((BigInt(now) << 22n) | randomBits).toString();
}

export function textMessageData(threadId, content, offlineId, { replyToMessageId, replyToUserId } = {}) {
  const data = {
    ig_thread_igid: positiveId(threadId, 'threadId'), recipient_igids: null,
    offline_threading_id: offlineId, send_attribution: 'igd_web_chat_tab:in_thread',
    text: { sensitive_string_value: text(content, 'message', { max: 10000 }) },
    mentions: [], mentioned_user_ids: [], commands: null,
    forwarded_from_thread_id: null, is_forwarded_from_own_message: null,
    replied_to_client_context: null, replied_to_item_id: null, reply_to_message_id: null, sampled: null,
  };
  if (replyToMessageId !== undefined) {
    data.reply_to_message_id = webMessageId(replyToMessageId);
    if (replyToUserId !== undefined) positiveId(replyToUserId, 'replyToUserId');
  } else if (replyToUserId !== undefined) throw new ValidationError('replyToMessageId is required with replyToUserId.');
  return data;
}

export function webMessageId(value) {
  const message = id(value, 'messageId', { numeric: false });
  if (message.length > 512 || /[\s\u0000-\u001f\u007f]/.test(message) || /^\d+$/.test(message)) {
    throw new ValidationError('This web operation requires a message ID, not a numeric native item ID.');
  }
  return message;
}
