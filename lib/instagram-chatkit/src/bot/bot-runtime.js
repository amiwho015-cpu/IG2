import { normalizeMessage } from './message.js';

export class BotRuntime {
  #queue = [];
  #worker;
  #startPromise;
  #closePromise;
  #accepting = false;
  #closed = false;

  constructor({ client, transport, realtime, maxQueue, processMessage, clear, log }) {
    Object.assign(this, { client, transport, realtime, maxQueue, processMessage, clear, log });
    this.onEvent = event => this.enqueue(event);
  }

  start() {
    if (this.#closed) return Promise.reject(new Error('Bot đã đóng; tạo instance mới để chạy lại.'));
    this.#startPromise ??= this.#start().catch(error => {
      this.#startPromise = null;
      throw error;
    });
    return this.#startPromise;
  }

  async #start() {
    this.#accepting = true;
    this.client.on('event', this.onEvent);
    try {
      await this.client.connectRealtime({ ...this.realtime, transport: this.transport });
      if (this.#closed) throw new Error('Bot đã đóng trong khi khởi động.');
      this.log('started', { transport: this.transport });
    } catch (error) {
      this.#accepting = false;
      this.client.off('event', this.onEvent);
      throw error;
    }
  }

  enqueue(event) {
    if (!this.#accepting || this.#closed) return false;
    const message = normalizeMessage(event);
    if (!message) return false;
    if (this.#queue.length >= this.maxQueue) {
      this.log('queueFull', { dropped: 1 });
      return false;
    }
    this.#queue.push(message);
    this.#worker ??= this.#drain();
    return true;
  }

  async #drain() {
    await Promise.resolve();
    try {
      while (this.#queue.length) {
        try { await this.processMessage(this.#queue.shift()); }
        catch { this.log('eventFailed', {}); }
      }
    } finally { this.#worker = null; }
  }

  close() {
    this.#closePromise ??= this.#close();
    return this.#closePromise;
  }

  async #close() {
    this.#closed = true;
    this.#accepting = false;
    this.client.off('event', this.onEvent);
    try {
      await this.#worker;
      await this.client.close();
      await Promise.allSettled([this.#startPromise].filter(Boolean));
    } finally {
      this.#queue.length = 0;
      this.clear();
      this.log('stopped', {});
    }
  }
}
