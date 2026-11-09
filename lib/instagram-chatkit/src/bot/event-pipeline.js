import { remember } from './bounded-map.js';
import { isMetaMessage, messageKey, normalizeMessage } from './message.js';

export class EventPipeline {
  #recent = new Map();

  constructor({ client, getPrefix, dispatch, history, replies, conversations, maxRecent }) {
    Object.assign(this, { client, getPrefix, dispatch, history, replies, conversations, maxRecent });
  }

  processEvent(event) {
    const message = normalizeMessage(event);
    if (message) return this.processMessage(message);
  }

  async processMessage(message) {
    if (isMetaMessage(message)) return this.history.handleMeta(message, (context, text) => this.replies.send(context, text));
    const selfIds = [String(this.client.session?.IGSID ?? '')];
    const cookieId = this.client.session?.cookieIGS?.match(/(?:^|;)\s*ds_user_id=([^;]+)/)?.[1];
    if (cookieId) selfIds.push(cookieId.trim());
    if (message.fromMe || !message.senderId || selfIds.includes(message.senderId) || this.replies.wasSent(message)) return;
    const key = messageKey(message);
    if (this.#recent.has(key)) return;
    remember(this.#recent, key, true, this.maxRecent);
    this.history.capture(message);
    const prefix = this.getPrefix();
    if (message.text.startsWith(prefix)) {
      const command = message.text.slice(prefix.length).trim() || 'help';
      const match = command.match(/^(\S+)(?:\s+([\s\S]*))?$/);
      if (match) await this.dispatch(message, match[1].toLowerCase(), match[2] ?? '');
      return;
    }
    if (this.conversations.autoDownload.get(message.threadKey)) {
      const link = message.text.match(/https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?/i)?.[0];
      if (link) await this.dispatch(message, 'dl', link);
    }
  }

  clear() {
    this.#recent.clear();
    this.history.clear();
    this.replies.clear();
    this.conversations.autoDownload.clear();
  }
}
