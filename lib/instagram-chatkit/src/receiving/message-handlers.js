import { InstagramError, ValidationError, ConnectionError } from '../shared/errors.js';
import { filters } from './filters.js';
import { ReceivedMessage } from './received-message.js';
import { messageIdentity, assertMessageIdentity } from './identity.js';

const updateTypes = new Set(['message', 'messageEdit', 'messageUnsend', 'threadUpdate', 'unseenCount', 'raw']);

export class MessageHandlers {
  #handlers = [];
  #errors = new Set();
  #queue = [];
  #worker;
  #closed = false;
  #overflowReported = false;

  constructor({ client, resolveThread, onError = () => {}, maxQueue = 1000, maxHandlers = 256, receiveOwnMessages = true }) {
    for (const [name, value] of Object.entries({ maxQueue, maxHandlers })) {
      if (!Number.isSafeInteger(value) || value < 1) throw new ValidationError(name + ' must be a positive integer.');
    }
    if (typeof receiveOwnMessages !== 'boolean') throw new ValidationError('receiveOwnMessages must be a boolean.');
    Object.assign(this, { client, resolveThread, onError, maxQueue, maxHandlers, receiveOwnMessages });
  }

  add(type, filter, handler, options = {}) {
    if (this.#closed) throw new ConnectionError('Client is closed.', { code: 'CLOSED', retryable: false });
    if (typeof handler !== 'function') { options = handler === undefined ? {} : handler; handler = filter; filter = () => true; }
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new ValidationError('Invalid receiving handler options.');
    const { group = 0 } = options;
    if (!updateTypes.has(type) || typeof filter !== 'function' || typeof handler !== 'function' || !Number.isSafeInteger(group)) {
      throw new ValidationError('A receiving handler requires functions and an integer group.');
    }
    if (this.#handlers.length + this.#errors.size >= this.maxHandlers) throw new ValidationError('Too many receiving handlers.');
    const record = { type, filter, handler, group, active: true };
    this.#handlers.push(record);
    return () => {
      record.active = false;
      const index = this.#handlers.indexOf(record);
      if (index >= 0) this.#handlers.splice(index, 1);
    };
  }

  onErrorHandler(handler) {
    if (this.#closed) throw new ConnectionError('Client is closed.', { code: 'CLOSED', retryable: false });
    if (typeof handler !== 'function' || this.#handlers.length + this.#errors.size >= this.maxHandlers) throw new ValidationError('Invalid receiving error handler.');
    this.#errors.add(handler);
    return () => this.#errors.delete(handler);
  }

  enqueue(event) {
    if (this.#closed || !event || !updateTypes.has(event.type) || !this.#handlers.some(handler => handler.type === event.type)) return false;
    if (this.#queue.length >= this.maxQueue) {
      if (!this.#overflowReported) {
        this.#overflowReported = true;
        void this.#report(new InstagramError('Receiving handler queue is full.', { code: 'HANDLER_QUEUE_FULL' }), event.type);
      }
      return false;
    }
    this.#queue.push({ type: event.type, identity: messageIdentity(this.client),
      data: event.data && typeof event.data === 'object' && !Array.isArray(event.data) ? { ...event.data } : event.data });
    this.#worker ??= this.#drain();
    return true;
  }

  async #drain() {
    await Promise.resolve();
    try {
      while (!this.#closed && this.#queue.length) {
        const event = this.#queue.shift();
        this.#overflowReported = false;
        try { await this.#dispatch(event); }
        catch (error) { await this.#report(error, event.type); }
      }
    } finally { this.#worker = undefined; }
  }

  async #dispatch(event) {
    assertMessageIdentity(this.client, event.identity);
    const message = ['message', 'messageEdit', 'messageUnsend'].includes(event.type)
      ? new ReceivedMessage(event.data, this.client, this.resolveThread, event.identity) : event.data;
    if (event.type === 'message' && !this.receiveOwnMessages && filters.self(message, this.client)) return;
    const handled = new Set();
    const records = this.#handlers.filter(handler => handler.type === event.type).sort((a, b) => a.group - b.group);
    for (const record of records) {
      if (this.#closed) break;
      if (!record.active || handled.has(record.group)) continue;
      assertMessageIdentity(this.client, event.identity);
      let matches;
      try { matches = await record.filter(message, this.client); }
      catch (error) {
        assertMessageIdentity(this.client, event.identity);
        await this.#report(error, event.type, record.group);
        continue;
      }
      assertMessageIdentity(this.client, event.identity);
      if (!matches || !record.active || this.#closed) continue;
      handled.add(record.group);
      try { await record.handler(message, this.client); }
      catch (error) { await this.#report(error, event.type, record.group); }
    }
  }

  async #report(cause, type, group) {
    if (this.#closed) return;
    const error = cause instanceof InstagramError && cause.code === 'HANDLER_QUEUE_FULL'
      ? cause : new InstagramError('A receiving handler failed.', { code: 'HANDLER_ERROR', cause });
    error.updateType = type;
    if (group !== undefined) error.group = group;
    try { this.onError(error); } catch {}
    for (const handler of [...this.#errors]) {
      if (this.#closed) break;
      if (!this.#errors.has(handler)) continue;
      try { await handler(error, this.client); } catch {}
    }
  }

  async wait() { await this.#worker; }

  close() {
    this.#closed = true;
    this.#queue.length = 0;
    this.#handlers.length = 0;
    this.#errors.clear();
  }
}
