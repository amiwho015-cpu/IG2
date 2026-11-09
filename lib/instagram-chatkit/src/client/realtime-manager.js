import { EventEmitter } from 'node:events';
import { MqttListener } from '../realtime/mqtt/mqtt-listener.js';
import { AuthenticationError, ConnectionError, ValidationError } from '../shared/errors.js';

const terminalStates = new Set(['fatal', 'auth_required', 'stopped']);
const mqttOptions = new Set([
  'reconnectPolicy', 'connectTimeout', 'maxPayloadBytes', 'maxRecentMessages',
  'sendTimeout', 'maxPendingSends', 'getBootstrap', 'connect',
]);

export class RealtimeManager extends EventEmitter {
  #login;
  #getSession;
  #getBootstrap;
  #listener = null;
  #connecting;
  #disconnecting;
  #stopping = false;
  #closed = false;
  #unsubscribe;

  constructor({ login, getSession, getBootstrap }) {
    super();
    this.#login = login;
    this.#getSession = getSession;
    this.#getBootstrap = getBootstrap;
  }

  get listener() { return this.#listener; }

  connect({ transport = 'mqtt', ...options } = {}) {
    if (this.#closed) return Promise.reject(closedError());
    if (this.#stopping) {
      return Promise.reject(new ConnectionError('Realtime is stopping.', { code: 'STOPPING', retryable: false }));
    }
    if (transport !== 'mqtt') {
      return Promise.reject(new ValidationError('Only MQTT realtime is supported.'));
    }
    if (Object.keys(options).some(key => !mqttOptions.has(key))) {
      return Promise.reject(new ValidationError('Unsupported realtime option.'));
    }
    if (this.#connecting) return this.#connecting;
    if (this.#listener) {
      if (terminalStates.has(this.#listener.state?.state)) {
        return Promise.reject(new ConnectionError('Realtime terminated. Call disconnectRealtime() before starting a new listener.', {
          code: 'REALTIME_TERMINATED', retryable: false,
        }));
      }
      return Promise.resolve(this.#listener);
    }
    this.#connecting = this.#connect(options).finally(() => {
      this.#connecting = undefined;
    });
    return this.#connecting;
  }

  disconnect() {
    this.#disconnecting ??= this.#disconnect().finally(() => { this.#disconnecting = undefined; });
    return this.#disconnecting;
  }

  close() {
    this.#closed = true;
    return this.disconnect();
  }

  async #connect(options) {
    await this.#login();
    if (this.#closed || this.#stopping) throw closedError();
    if (!this.#getSession()) throw new AuthenticationError('Realtime requires Instagram web session cookies.');
    const listener = new MqttListener({ ...options, session: this.#getSession(), getBootstrap: options.getBootstrap ?? this.#getBootstrap });
    this.#attach(listener);
    try {
      await listener.start();
      return listener;
    } catch (error) {
      await listener.close().catch(() => {});
      this.#detach(listener);
      throw error;
    }
  }

  #attach(listener) {
    this.#listener = listener;
    const onEvent = event => {
      if (this.#listener === listener) this.emit('event', event);
    };
    const onError = error => {
      if (this.#listener === listener) this.emit('listenerError', error);
    };
    const onState = state => {
      if (this.#listener !== listener) return;
      if (state.state === 'stopped') this.#detach(listener);
      this.emit('state', state);
    };
    listener.on('event', onEvent);
    listener.on('state', onState);
    listener.on('listenerError', onError);
    this.#unsubscribe = () => {
      listener.off('event', onEvent);
      listener.off('state', onState);
      listener.off('listenerError', onError);
    };
  }

  #detach(listener) {
    if (this.#listener !== listener) return;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#listener = null;
  }

  async #disconnect() {
    this.#stopping = true;
    const listener = this.#listener;
    try {
      if (listener) await listener.close();
      await Promise.allSettled([this.#connecting].filter(Boolean));
    } finally {
      if (this.#listener) this.#detach(this.#listener);
      this.#stopping = false;
    }
  }
}

function closedError() {
  return new ConnectionError('Client is closed.', { code: 'CLOSED', retryable: false });
}
