import { ValidationError, InstagramError, DeliveryUnknownError } from '../shared/errors.js';
import { positiveId, text } from '../shared/validation.js';
import { messageIdentity, assertMessageIdentity } from './identity.js';

const fields = ['id', 'itemId', 'messageId', 'nativeThreadId', 'threadId', 'threadFbid', 'senderId',
  'text', 'newText', 'itemType', 'clientContext', 'timestampMs', 'fromMe', 'isGroup', 'media', 'attachments', 'reactions', 'thread', 'raw'];

export class ReceivedMessage {
  #client;
  #resolveThread;
  #identity;

  constructor(data, client, resolveThread, identity = messageIdentity(client)) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ValidationError('Invalid incoming message.');
    for (const key of ['id', 'itemId', 'messageId', 'nativeThreadId', 'threadId', 'threadFbid', 'senderId']) {
      const value = data[key];
      if (value != null && (!['string', 'number', 'bigint'].includes(typeof value) ||
          (typeof value === 'number' && !Number.isSafeInteger(value)) || String(value).length > 512)) {
        throw new ValidationError('Incoming message identifiers must be exact strings.');
      }
    }
    if (data.text != null && (typeof data.text !== 'string' || data.text.length > 100_000)) throw new ValidationError('Invalid incoming text.');
    if (data.newText != null && (typeof data.newText !== 'string' || data.newText.length > 100_000)) throw new ValidationError('Invalid incoming edit text.');
    this.#client = client;
    this.#resolveThread = resolveThread;
    this.#identity = identity;
    for (const key of fields) if (data[key] !== undefined) this[key] = data[key];
    this.id = String(data.id ?? data.itemId ?? data.messageId ?? '');
    this.senderId = String(data.senderId ?? '');
    this.text = data.text ?? data.newText ?? '';
    this.raw = data.raw ?? data;
  }

  async getThread({ signal } = {}) {
    this.#assert();
    signal?.throwIfAborted();
    if (this.thread) return this.thread;
    if (typeof this.#resolveThread !== 'function') throw new ValidationError('Thread lookup is unavailable.');
    const thread = await this.#resolveThread(this, { signal });
    this.#assert();
    signal?.throwIfAborted();
    if (!thread || typeof thread !== 'object') throw new InstagramError('Conversation metadata is unavailable.', { code: 'THREAD_NOT_FOUND' });
    this.thread = thread;
    if (typeof thread.is_group === 'boolean') this.isGroup = thread.is_group;
    return thread;
  }

  async replyText(content, { signal } = {}) {
    this.#assert();
    text(content, 'text', { max: 10000 });
    signal?.throwIfAborted();
    if (this.nativeThreadId != null && typeof this.#client.realtime?.sendText === 'function') {
      return this.#confirm(this.#client.realtime.sendText(this.nativeThreadId, content, { signal }));
    }
    if (this.threadFbid != null) return this.#confirm(this.#client.messages.send(this.threadFbid, content, { signal }));
    if (this.nativeThreadId != null) return this.#confirm(this.#client.messages.sendToGroup(this.nativeThreadId, content, { signal }));
    throw new ValidationError('The message has no confirmed destination ID.');
  }

  #mid() {
    const value = this.messageId;
    if (typeof value !== 'string' || !value || value.length > 512 || /^\d+$/.test(value) || /[\s\u0000-\u001f\u007f]/.test(value) ||
        (this.itemId != null && String(this.itemId) === value && this.raw?.message_id !== value)) {
      throw new ValidationError('This operation requires the web MID; an Iris item ID cannot replace it.');
    }
    return value;
  }

  async markSeen({ signal } = {}) {
    this.#assert();
    const mid = this.#mid();
    const native = this.nativeThreadId ?? (await this.getThread({ signal })).thread_id;
    this.#assert();
    return this.#confirm(this.#client.messages.markSeen(positiveId(native, 'nativeThreadId'), mid, { signal }));
  }

  async react(emoji, { remove = false, signal } = {}) {
    this.#assert();
    const mid = this.#mid();
    const thread = this.threadFbid == null ? await this.getThread({ signal }) : null;
    const fbid = positiveId(this.threadFbid ?? thread?.thread_fbid ?? thread?.id, 'threadFbid');
    this.#assert();
    return this.#confirm(this.#client.messages.react(fbid, mid, emoji, { remove, signal }));
  }

  async downloadMedia(options = {}) {
    this.#assert();
    const isFile = attachment => attachment && attachment.type !== 'link' && attachment.type !== 'like' && attachment.url;
    const url = (isFile(this.media) ? this.media.url : undefined) ?? this.attachments?.find(isFile)?.url;
    if (!url) throw new InstagramError('Instagram did not provide a downloadable media URL.', { code: 'MEDIA_UNAVAILABLE' });
    return this.#client.media.download(url, options);
  }

  #assert() { assertMessageIdentity(this.#client, this.#identity); }

  async #confirm(operation) {
    const result = await operation;
    try { this.#assert(); }
    catch (error) { throw new DeliveryUnknownError(undefined, { cause: error }); }
    return result;
  }
}
