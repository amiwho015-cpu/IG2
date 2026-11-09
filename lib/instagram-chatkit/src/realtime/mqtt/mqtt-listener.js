import { EventEmitter } from 'node:events';
import { randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { AuthenticationError, ConnectionError, DeliveryUnknownError, InstagramError, TimeoutError, ValidationError } from '../../shared/errors.js';
import { parseCookies } from '../../shared/cookies.js';
import { boolean, positiveId, text } from '../../shared/validation.js';
import { ReconnectPolicy } from '../reconnect-policy.js';
import { stringifyJson } from '../wire-format.js';
import { connectionOptions } from './connection-options.js';
import { normalizeDelta, parseControlPayload, parseDeltaPayload } from './delta-parser.js';
import { SyncState } from './sync-state.js';

const topics = ['/ig_message_sync', '/ig_send_message_response', '/ig_sub_iris_response'];
let lastContext = 0n;

function networkError() {
  return new ConnectionError('MQTT connection ended.', { code: 'network_disconnected', retryable: true });
}

function mqttError(error) {
  if (error instanceof InstagramError) return error;
  if ([1, 2].includes(Number(error?.code ?? error?.returnCode))) {
    return new ConnectionError('Instagram rejected the MQTT protocol or client identifier.', { code: 'protocol_error', retryable: false });
  }
  if ([4, 5, 134, 135].includes(Number(error?.code ?? error?.returnCode))) {
    return new AuthenticationError('MQTT authentication failed. Renew the Instagram cookie.', { code: 'auth_required' });
  }
  return networkError();
}

function unconfirmed() {
  return new DeliveryUnknownError('Instagram did not confirm the message. Check the conversation before sending again.');
}

function clientContext(value) {
  if (value !== undefined) return positiveId(value, 'clientContext');
  const candidate = (BigInt(Date.now()) << 22n) | BigInt(randomInt(0, 2 ** 22));
  lastContext = candidate > lastContext ? candidate : lastContext + 1n;
  return lastContext.toString();
}

function itemId(value, name) {
  if (!['string', 'number', 'bigint'].includes(typeof value) || (typeof value === 'number' && !Number.isSafeInteger(value))) {
    throw new ValidationError(name + ' must be an exact message item ID.');
  }
  const result = String(value);
  if (!/^[A-Za-z0-9._$:-]{1,512}$/.test(result)) throw new ValidationError(name + ' is invalid.');
  if (/^\d+$/.test(result)) positiveId(result, name);
  return result;
}

export class MqttListener extends EventEmitter {
  #cycle;
  #profile;
  #closed = true;
  #controller;
  #loop;
  #startPromise;
  #resolveStart;
  #rejectStart;
  #seen = new Map();
  #usedContexts = new Map();
  #pending = new Map();
  #connectedAt = 0;
  #sync = new SyncState();
  #closePromise;

  constructor({
    session, getBootstrap, getSequence, lastSeqId, syncToken,
    reconnectPolicy = new ReconnectPolicy(), connect,
    connectTimeout = 30000, sendTimeout = 30000,
    maxPayloadBytes = 4 * 1024 * 1024, maxRecentMessages = 4096, maxPendingSends = 256,
  } = {}) {
    super();
    if (!session || typeof getBootstrap !== 'function' || !(reconnectPolicy instanceof ReconnectPolicy) ||
        (connect !== undefined && typeof connect !== 'function')) {
      throw new ValidationError('Native Instagram MQTT requires a session and getBootstrap callback.');
    }
    if (getSequence !== undefined || lastSeqId !== undefined || syncToken !== undefined) {
      throw new ValidationError('Legacy Facebook MQTT sequence/token options are unsupported. Use getBootstrap.');
    }
    for (const [name, value] of Object.entries({ connectTimeout, sendTimeout, maxPayloadBytes, maxRecentMessages, maxPendingSends })) {
      if (!Number.isSafeInteger(value) || value < 1) throw new ValidationError(name + ' must be a positive integer.');
    }
    Object.assign(this, { session, getBootstrap, reconnectPolicy, connect, connectTimeout, sendTimeout, maxPayloadBytes, maxRecentMessages, maxPendingSends });
    this.state = { state: 'stopped', reason: '', attempt: 0, nextRetryIn: 0 };
  }

  get lastSeqId() { return this.#sync.lastSeqId; }
  get pendingCount() { return this.#pending.size; }

  start() {
    if (this.#closed && this.#closePromise && this.state.state !== 'stopped') {
      return Promise.reject(new ConnectionError('MQTT is stopping.', { code: 'stopping', retryable: false }));
    }
    if (this.state.state === 'connected') return Promise.resolve(this);
    if (this.#loop && !this.#resolveStart) {
      return Promise.reject(new ConnectionError('MQTT is reconnecting; watch state events.', { code: 'reconnecting', retryable: true }));
    }
    if (this.#startPromise) return this.#startPromise;
    if (!parseCookies(this.session.cookieIGS).get('sessionid')) throw new AuthenticationError();
    this.#closed = false;
    this.#closePromise = undefined;
    this.#controller = new AbortController();
    this.#startPromise = new Promise((resolve, reject) => {
      this.#resolveStart = resolve;
      this.#rejectStart = reject;
    });
    this.#loop = this.#supervise()
      .catch(error => {
        if (!this.#closed) {
          this.#setState(error instanceof AuthenticationError ? 'auth_required' : 'fatal', error.code);
          this.emit('listenerError', error);
        }
        this.#rejectStart?.(error);
      })
      .finally(() => {
        this.#loop = undefined;
        this.#startPromise = undefined;
        this.#resolveStart = undefined;
        this.#rejectStart = undefined;
      });
    return this.#startPromise;
  }

  async #supervise() {
    let attempt = 0;
    this.#setState('starting');
    while (!this.#closed) {
      try {
        await this.#connectOnce();
      } catch (rawError) {
        if (this.#closed) return;
        const error = mqttError(rawError);
        await this.#disconnect();
        if (this.#connectedAt && Date.now() - this.#connectedAt >= this.reconnectPolicy.stableResetAfter) attempt = 0;
        if (!error.retryable || !this.reconnectPolicy.allows(++attempt)) throw error;
        this.#connectedAt = 0;
        const milliseconds = this.reconnectPolicy.delay(attempt);
        this.#setState('reconnecting', error.code, attempt, milliseconds);
        await delay(milliseconds, undefined, { signal: this.#controller.signal });
      }
    }
  }

  async #bootstrap() {
    const signal = this.#controller.signal;
    const value = await new Promise((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        return this.getBootstrap({ signal });
      }).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
    signal.throwIfAborted();
    const actorId = positiveId(value?.actorId, 'bootstrap.actorId');
    const deviceId = text(value?.deviceId, 'bootstrap.deviceId', { max: 512 });
    if (/[\u0000-\u001f\u007f]/.test(deviceId)) throw new ValidationError('bootstrap.deviceId contains control characters.');
    if (this.#profile && this.#profile.actorId !== actorId) {
      throw new AuthenticationError('The Instagram account changed. Create a new realtime connection.', { code: 'SESSION_CHANGED' });
    }
    const bootstrap = { sequenceId: value.sequenceId, snapshotAtMs: value.snapshotAtMs, actorId, deviceId };
    this.#sync.setBootstrap(bootstrap);
    this.#profile = { actorId, deviceId };
    return bootstrap;
  }

  async #connectOnce() {
    const bootstrap = await this.#bootstrap();
    if (this.#closed) return;
    const connect = this.connect ?? (await import('mqtt')).connect;
    if (this.#closed) return;
    const { url, options } = connectionOptions(this.session, this.connectTimeout, bootstrap);
    const client = connect(url, options);
    const cycle = { client, bootstrap, active: true, ready: false, awaitingIris: false, buffered: [], bufferedBytes: 0 };
    this.#cycle = cycle;

    return new Promise((resolve, reject) => {
      const signal = this.#controller.signal;
      const active = () => cycle.active && !this.#closed && this.#cycle === cycle;
      const settle = error => {
        if (!cycle.active) return;
        cycle.active = false;
        cycle.ready = false;
        cycle.buffered.length = 0;
        cycle.bufferedBytes = 0;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        this.#rejectSends(cycle);
        if (error) reject(error);
        else resolve();
      };
      const onAbort = () => settle();
      const timer = setTimeout(() => settle(new TimeoutError('Instagram Iris subscription timed out.', {
        code: 'network_disconnected', retryable: true,
      })), this.connectTimeout);
      signal.addEventListener('abort', onAbort, { once: true });
      cycle.stop = settle;
      client.once('close', () => settle(active() ? networkError() : undefined));
      client.on('error', error => { if (active()) settle(mqttError(error)); });
      client.on('disconnect', packet => { if (active()) settle(mqttError({ code: packet?.reasonCode })); });
      client.once('connect', async packet => {
        if (!active()) return;
        if (packet?.returnCode && packet.returnCode !== 0) return settle(mqttError({ code: packet.returnCode }));
        try {
          await this.#subscribe(client);
          if (!active()) return;
          const { topic, payload } = this.#sync.buildSubscription();
          cycle.awaitingIris = true;
          client.publish(topic, payload, { qos: 1, retain: false }, error => {
            if (active() && error) settle(mqttError(error));
          });
        } catch (error) { settle(error); }
      });
      client.on('message', (topic, raw) => {
        if (!active()) return;
        try {
          if (topic === '/ig_sub_iris_response' && cycle.awaitingIris) {
            const ack = parseControlPayload(raw, this.maxPayloadBytes);
            if (ack.succeeded !== true) {
              const auth = [4, 5, 134, 135].includes(Number(ack.error_code));
              throw auth ? mqttError({ code: ack.error_code }) : new ConnectionError('Instagram rejected the Iris subscription.', { code: 'IRIS_SUBSCRIPTION_REJECTED', retryable: false });
            }
            if (cycle.ready) return;
            cycle.ready = true;
            clearTimeout(timer);
            this.#connectedAt = Date.now();
            this.#setState('connected');
            this.#resolveStart?.(this);
            this.#resolveStart = undefined;
            this.#rejectStart = undefined;
            for (const envelopes of cycle.buffered) this.#emitMessages(envelopes);
            cycle.buffered.length = 0;
            cycle.bufferedBytes = 0;
          } else if (topic === '/ig_message_sync') {
            if (!cycle.awaitingIris) return;
            const envelopes = parseDeltaPayload(raw, this.maxPayloadBytes);
            if (cycle.ready) this.#emitMessages(envelopes);
            else {
              cycle.bufferedBytes += Buffer.byteLength(raw);
              if (cycle.bufferedBytes > this.maxPayloadBytes || cycle.buffered.length >= 1000) {
                settle(new ConnectionError('Initial Iris sync exceeds the buffer limit.', { code: 'IRIS_SYNC_OVERFLOW', retryable: false }));
                return;
              }
              cycle.buffered.push(envelopes);
            }
          } else if (topic === '/ig_send_message_response') {
            this.#onSendAck(raw, cycle);
          }
        } catch (error) {
          if (topic === '/ig_message_sync' || topic === '/ig_send_message_response') this.emit('listenerError', mqttError(error));
          else settle(mqttError(error));
        }
      });
      try { client.connect(); }
      catch (error) { settle(mqttError(error)); }
    });
  }

  #subscribe(client) {
    return new Promise((resolve, reject) => {
      client.subscribe(topics, { qos: 0 }, (error, granted) => {
        if (error || !Array.isArray(granted) || topics.some(topic => !granted.some(item => item.topic === topic && item.qos !== 128))) {
          reject(new ConnectionError('MQTT subscription failed.', { code: 'protocol_error', retryable: false }));
        } else resolve();
      });
    });
  }

  #emitMessages(envelopes) {
    for (const envelope of envelopes) {
      if (!this.#sync.apply(envelope)) continue;
      for (const delta of envelope.deltas) {
        this.emit('event', { type: 'raw', data: delta });
        const event = normalizeDelta(delta);
        if (!event) continue;
        if (event.type === 'message' || event.type === 'messageUnsend') {
          const key = event.type + ':' + event.data.nativeThreadId + ':' + event.data.id;
          if (this.#seen.has(key)) continue;
          this.#seen.set(key, true);
          if (this.#seen.size > this.maxRecentMessages) this.#seen.delete(this.#seen.keys().next().value);
        }
        this.emit('event', event);
      }
    }
  }

  async sendText(threadId, content, { replyToId, replyToClientContext, clientContext: context, signal } = {}) {
    const message = text(content, 'text', { max: 10000 });
    const reply = replyToId === undefined ? undefined : itemId(replyToId, 'replyToId');
    const replyContext = replyToClientContext === undefined ? '' : text(replyToClientContext, 'replyToClientContext', { empty: true, max: 512 });
    if (!reply && replyToClientContext !== undefined) throw new ValidationError('replyToClientContext requires replyToId.');
    return this.#sendItem(threadId, {
      action: 'send_item', item_type: 'text', text: message,
      ...(reply ? { replied_to_item_id: reply, replied_to_client_context: replyContext } : {}),
    }, { clientContext: context, signal });
  }

  async sendLike(threadId, { clientContext: context, signal } = {}) {
    return this.#sendItem(threadId, { action: 'send_item', item_type: 'like' }, { clientContext: context, signal });
  }

  async sendMediaShare(threadId, mediaId, { isClip = false, clientContext: context, signal } = {}) {
    boolean(isClip, 'isClip');
    return this.#sendItem(threadId, {
      action: 'send_item', item_type: isClip ? 'clip_share' : 'media_share', media_id: positiveId(mediaId, 'mediaId'),
    }, { clientContext: context, signal });
  }

  async indicateTyping(threadId, active = true, { clientContext: context, signal } = {}) {
    boolean(active, 'active');
    return this.#sendItem(threadId, {
      action: 'indicate_activity', activity_status: active ? '1' : '0',
    }, { clientContext: context, signal, active });
  }

  async #sendItem(threadId, item, { clientContext: context, signal, active } = {}) {
    const nativeThreadId = positiveId(threadId, 'nativeThreadId');
    const mutation = clientContext(context);
    signal?.throwIfAborted();
    const cycle = this.#cycle;
    if (!cycle?.active || !cycle.ready || this.#closed) throw new ConnectionError('Instagram Iris is not ready. Await start() before sending.', { code: 'not_connected', retryable: false });
    if (this.#usedContexts.has(mutation) || this.#pending.has(mutation)) throw new ValidationError('clientContext was already used. Check the previous message before sending again.');
    if (this.#pending.size >= this.maxPendingSends) throw new ConnectionError('Too many unconfirmed messages.', { code: 'SEND_QUEUE_FULL', retryable: false });
    const payload = {
      ...item, thread_id: nativeThreadId,
      client_context: mutation, device_id: cycle.bootstrap.deviceId,
      ...(['text', 'like'].includes(item.item_type) ? { mutation_token: mutation } : {}),
    };
    this.#usedContexts.set(mutation, true);
    if (this.#usedContexts.size > this.maxRecentMessages) this.#usedContexts.delete(this.#usedContexts.keys().next().value);
    return new Promise((resolve, reject) => {
      const pending = { cycle, nativeThreadId, resolve, reject, signal, active };
      const fail = () => this.#finishSend(mutation, pending, unconfirmed());
      pending.onAbort = fail;
      pending.timer = setTimeout(fail, this.sendTimeout);
      signal?.addEventListener('abort', fail, { once: true });
      this.#pending.set(mutation, pending);
      try {
        cycle.client.publish('/ig_send_message', stringifyJson(payload), { qos: 1, retain: false }, error => {
          if (error) this.#finishSend(mutation, pending, unconfirmed());
        });
      } catch { fail(); }
    });
  }

  #onSendAck(raw, cycle) {
    const ack = parseControlPayload(raw, this.maxPayloadBytes);
    const value = ack.payload;
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.client_context === undefined) return;
    const context = String(value.client_context);
    const pending = this.#pending.get(context);
    if (!pending || pending.cycle !== cycle || !cycle.active || !cycle.ready) return;
    if (value.thread_id !== undefined && String(value.thread_id) !== pending.nativeThreadId) return;
    if (ack.status === 'fail') {
      this.#finishSend(context, pending, new InstagramError('Instagram rejected the message.', { code: 'MESSAGE_REJECTED', retryable: false }));
      return;
    }
    if (ack.status !== 'ok') return;
    if (pending.active !== undefined) {
      this.#finishSend(context, pending, undefined, {
        nativeThreadId: pending.nativeThreadId, clientContext: context, active: pending.active, deliveryStatus: 'acknowledged',
      });
      return;
    }
    const rawId = value.item_id ?? value.message_id;
    if (rawId === undefined) return;
    const messageId = itemId(rawId, 'ack.messageId');
    this.#finishSend(context, pending, undefined, {
      messageId, itemId: value.item_id === undefined ? undefined : String(value.item_id),
      nativeThreadId: pending.nativeThreadId, clientContext: context, deliveryStatus: 'confirmed',
    });
  }

  #finishSend(context, pending, error, result) {
    if (this.#pending.get(context) !== pending) return;
    this.#pending.delete(context);
    clearTimeout(pending.timer);
    pending.signal?.removeEventListener('abort', pending.onAbort);
    if (error) pending.reject(error);
    else pending.resolve(result);
  }

  #rejectSends(cycle) {
    for (const [context, pending] of this.#pending) {
      if (pending.cycle === cycle) this.#finishSend(context, pending, unconfirmed());
    }
  }

  #setState(state, reason = '', attempt = 0, nextRetryIn = 0) {
    this.state = { state, reason, attempt, nextRetryIn };
    this.emit('state', { ...this.state });
  }

  async #disconnect() {
    const cycle = this.#cycle;
    this.#cycle = undefined;
    if (!cycle) return;
    cycle.stop?.();
    this.#rejectSends(cycle);
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 1000);
      try { cycle.client.end(true, {}, () => { clearTimeout(timer); resolve(); }); }
      catch { clearTimeout(timer); resolve(); }
    });
  }

  close() {
    this.#closePromise ??= this.#close();
    return this.#closePromise;
  }

  async #close() {
    this.#closed = true;
    this.#controller?.abort();
    this.#rejectStart?.(new ConnectionError('MQTT was stopped.', { code: 'stopped', retryable: false }));
    await this.#disconnect();
    await this.#loop;
    this.#seen.clear();
    this.#usedContexts.clear();
    this.#setState('stopped', 'stopped');
  }
}
