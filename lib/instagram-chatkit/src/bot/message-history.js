import { remember } from './bounded-map.js';
import { messageKey } from './message.js';
import { formatResult } from './result-format.js';

export class MessageHistory {
  #enabled = new Map();
  #messages = new Map();

  constructor(maxMessages = 1024) { this.maximum = maxMessages; }

  setEnabled(threadKey, enabled) {
    const evicted = !this.#enabled.has(threadKey) && this.#enabled.size >= 128 ? this.#enabled.keys().next().value : null;
    remember(this.#enabled, threadKey, enabled, 128);
    if (!enabled) this.#forgetThread(threadKey);
    if (evicted) this.#forgetThread(evicted);
  }

  #forgetThread(threadKey) {
    for (const [key, message] of this.#messages) if (message.threadKey === threadKey) this.#messages.delete(key);
  }

  capture(message) {
    if (this.#enabled.get(message.threadKey)) remember(this.#messages, messageKey(message), message, this.maximum);
  }

  async handleMeta(event, reply) {
    const matches = [...this.#messages.entries()].filter(([, cached]) => cached.id === event.id && (
      !event.threadKey || cached.threadKey === event.threadKey || (event.threadId && cached.threadId === event.threadId)
    ));
    if (matches.length !== 1) return;
    const [key, previous] = matches[0];
    if (!this.#enabled.get(previous.threadKey) || (event.senderId && event.senderId !== previous.senderId)) return;
    const context = { ...previous, id: '' };
    if (event.type === 'messageUnsend') {
      this.#messages.delete(key);
      await reply(context, `Tin nhắn vừa thu hồi (${previous.senderId}):\n${previous.text || '[Media]'}\n${formatResult(previous.attachments)}`);
      return;
    }
    await reply(context, `Tin nhắn vừa sửa (${previous.senderId}):\nTrước: ${previous.text}\nSau: ${event.text}`);
    remember(this.#messages, key, { ...previous, text: event.text }, this.maximum);
  }

  clear() { this.#messages.clear(); this.#enabled.clear(); }
}
