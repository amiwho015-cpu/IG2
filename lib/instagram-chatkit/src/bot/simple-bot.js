import { EventEmitter } from 'node:events';
import { BotRuntime } from './bot-runtime.js';
import { dispatchCommand } from './command-dispatcher.js';
import { createCommandRegistry } from './commands/registry.js';
import { EventPipeline } from './event-pipeline.js';
import { MessageHistory } from './message-history.js';
import { ReplyService } from './reply-service.js';
import { SearchLimiter } from './search-limiter.js';

export class SimpleBot extends EventEmitter {
  #admins;
  #dispatchOptions;
  #replies;
  #pipeline;
  #runtime;

  constructor({ client, prefix = '/', admins = [], transport = 'mqtt', realtime = {}, maxQueue = 1000, maxRecent = 4096, maxCached = 1024, logger = () => {}, clock = Date.now } = {}) {
    super();
    if (!client || typeof client.connectRealtime !== 'function') throw new TypeError('client phải là InstagramClient.');
    if (typeof prefix !== 'string' || !prefix.trim() || prefix.length > 20) throw new TypeError('prefix phải là chuỗi từ 1 đến 20 ký tự.');
    if (!Array.isArray(admins) || admins.some(id => typeof id !== 'string' || !/^\d+$/.test(id))) throw new TypeError('admins phải là mảng ID dạng chuỗi chữ số.');
    if (transport !== 'mqtt') throw new TypeError('transport chỉ hỗ trợ mqtt.');
    for (const value of [maxQueue, maxRecent, maxCached]) if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Giới hạn bộ nhớ phải là số nguyên dương.');
    this.client = client;
    this.prefix = prefix;
    this.transport = transport;
    this.logger = logger;
    this.#admins = new Set(admins);
    const history = new MessageHistory(maxCached);
    const conversations = { autoDownload: new Map() };
    this.#replies = new ReplyService(client, maxRecent);
    this.commands = createCommandRegistry({ history, conversations, searchLimiter: new SearchLimiter({ clock }) });
    const log = (type, data) => this.log(type, data);
    this.#dispatchOptions = { bot: this, client, commands: this.commands, admins: this.#admins, replies: this.#replies, log };
    this.#pipeline = new EventPipeline({
      client, getPrefix: () => this.prefix, history, conversations, replies: this.#replies, maxRecent,
      dispatch: (message, name, argument) => this.dispatch(message, name, argument),
    });
    this.#runtime = new BotRuntime({
      client, transport, realtime, maxQueue, log,
      processMessage: message => this.#pipeline.processMessage(message),
      clear: () => this.#pipeline.clear(),
    });
  }

  isAdmin(senderId) { return this.#admins.has(senderId); }
  async start() { await this.#runtime.start(); return this; }
  close() { return this.#runtime.close(); }
  enqueue(event) { return this.#runtime.enqueue(event); }
  async processEvent(event) { return this.#pipeline.processEvent(event); }
  async dispatch(message, name, argument) { return dispatchCommand(this.#dispatchOptions, message, name, argument); }
  reply(message, text) { return this.#replies.send(message, text); }

  log(type, data = {}) {
    try { this.logger(type, data); } catch {}
    this.emit('status', { type, ...data });
  }
}
