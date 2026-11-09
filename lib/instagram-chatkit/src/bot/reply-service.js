import { CommandError } from './command-input.js';
import { remember } from './bounded-map.js';
import { messageKey } from './message.js';

export class ReplyService {
  #sent = new Map();

  constructor(client, maxRecent = 4096) { this.client = client; this.maximum = maxRecent; }

  wasSent(message) { return this.#sent.has(messageKey(message)); }

  async send(message, text) {
    const content = String(text).slice(0, 4000);
    let result;
    if (message.nativeThreadId) {
      const listener = this.client.realtime;
      if (typeof listener?.sendText !== 'function') throw new CommandError('Kết nối Instagram Iris chưa sẵn sàng để trả lời.');
      result = await listener.sendText(message.nativeThreadId, content, {
        ...(message.id ? { replyToId: message.id } : {}),
        ...(message.clientContext ? { replyToClientContext: message.clientContext } : {}),
      });
    } else {
      const options = message.id ? { replyToMessageId: message.id, replyToUserId: message.senderId } : {};
      result = await this.client.messages.send(message.threadId, content, options);
    }
    const id = result?.messageId || result?.id;
    if (id) remember(this.#sent, messageKey({ ...message, id }), true, this.maximum);
    return result;
  }

  clear() { this.#sent.clear(); }
}
