import { EventEmitter } from 'node:events';
import { SessionManager } from './client/session-manager.js';
import { RealtimeManager } from './client/realtime-manager.js';
import { createFeatures } from './client/create-features.js';
import { createMessageHandlers } from './client/create-message-handlers.js';
import { createInboxContextProvider, getInstagramBootstrap } from './auth/realtime-bootstrap.js';
import { HttpTransport } from './transport/http/http-client.js';
import { SessionStorage } from './storage/session-storage.js';
import { ConnectionError, InstagramError, ValidationError } from './shared/errors.js';
import { parseCookies } from './shared/cookies.js';
import { createLogger, errorFields } from './shared/logger.js';

export class InstagramClient extends EventEmitter {
  #sessions;
  #realtime;
  #loginPromise;
  #closePromise;
  #logoutPromise;
  #closed = false;
  #lifecycle = new AbortController();
  #http;
  #receiving;
  #log;
  #onReceivingEvent = event => {
    this.#log('debug', 'receiving.updateReceived', { updateType: event?.type });
    return this.#receiving.enqueue(event);
  };

  constructor(options = {}) {
    super();
    if (options.mobile !== undefined || options.device !== undefined) {
      throw new ValidationError('Device profiles are unsupported. This client uses Instagram web cookies.');
    }
    if (options.username !== undefined || options.password !== undefined) {
      throw new InstagramError('Password login is unavailable. Provide browser cookies or a saved web session.', { code: 'UNSUPPORTED_OPERATION' });
    }
    this.#log = createLogger(options.logger, options.logLevel);
    this.#http = new HttpTransport({ ...options, session: options.session ? { ...options.session } : undefined,
      getWebContext: requestOptions => getInboxContext(requestOptions),
    });
    const getInboxContext = createInboxContextProvider(this.#http);
    const getBootstrap = options => getInstagramBootstrap(this.#http, options, getInboxContext);
    Object.assign(this, createFeatures(this.#http, {
      getBootstrap, getInboxContext,
      onLogout: () => this.#endSession(),
    }));
    this.#receiving = createMessageHandlers(this, getInboxContext, options.receiving);
    this.on('event', this.#onReceivingEvent);
    this.#sessions = new SessionManager(this.#http, {
      ...options, onAccountChange: () => this.realtime ? this.disconnectRealtime() : undefined,
    });
    this.#realtime = new RealtimeManager({
      login: () => this.login(),
      getSession: () => this.session,
      getBootstrap,
    });
    this.#realtime.on('state', state => {
      const level = ['fatal', 'auth_required'].includes(state.state) ? 'error'
        : state.state === 'reconnecting' ? 'warn' : 'info';
      this.#log(level, 'realtime.stateChanged', { ...state, code: state.reason });
    });
    this.#realtime.on('listenerError', error => this.#log('error', 'realtime.failed', errorFields(error)));
    this.on('handlerError', error => this.#log('error', 'receiving.handlerFailed', {
      ...errorFields(error), updateType: error.updateType, group: error.group,
    }));
    for (const event of ['event', 'state', 'listenerError']) {
      this.#realtime.on(event, payload => this.emit(event, payload));
    }
  }

  get session() { return this.#http.session; }
  get storage() { return this.#sessions.storage; }
  set storage(storage) { this.#sessions.storage = storage; }
  get realtime() { return this.#realtime.listener; }
  get closed() { return this.#closed; }

  static async connect(options) {
    const client = new InstagramClient(options);
    try {
      await client.login();
      return client;
    } catch (error) {
      await client.close();
      throw error;
    }
  }

  login({ username, password, signal } = {}) {
    if (this.#closed) return Promise.reject(closedError());
    if (this.#logoutPromise) return Promise.reject(new ConnectionError('Logout is in progress.', { code: 'LOGGING_OUT', retryable: false }));
    if (username !== undefined || password !== undefined) {
      return Promise.reject(new InstagramError('Password login is unavailable. Provide browser cookies or a saved web session.', { code: 'UNSUPPORTED_OPERATION' }));
    }
    if (this.session && username === undefined && password === undefined) return Promise.resolve(this);
    const combined = AbortSignal.any([this.#lifecycle.signal, ...(signal ? [signal] : [])]);
    if (!this.#loginPromise) {
      const started = performance.now();
      this.#loginPromise = this.#sessions.authenticate({ username, password, signal: combined })
        .then(() => {
          this.#log('info', 'session.loginCompleted', { durationMs: performance.now() - started });
          return this;
        })
        .catch(error => {
          this.#log('error', 'session.loginFailed', { ...errorFields(error), durationMs: performance.now() - started });
          throw error;
        })
        .finally(() => { this.#loginPromise = undefined; });
      this.#log('info', 'session.loginStarted');
    }
    return this.#loginPromise;
  }

  logout(options) { return this.account.logout(options); }

  #endSession() {
    this.#logoutPromise ??= this.#clearSession().finally(() => { this.#logoutPromise = undefined; });
    return this.#logoutPromise;
  }

  async #clearSession() {
    const storage = this.storage;
    const login = this.#loginPromise;
    this.#sessions.invalidate();
    this.#http.setCookies('');
    this.#http.session = undefined;
    await this.disconnectRealtime();
    await login?.catch(() => {});
    await storage?.clear?.();
    this.#log('info', 'session.loggedOut');
  }

  isLoggedIn() {
    if (this.#closed) return false;
    const cookies = parseCookies(this.#http.cookies);
    return Boolean(cookies.get('sessionid') && /^[1-9]\d*$/.test(cookies.get('ds_user_id') ?? ''));
  }

  async isSessionValid(options) {
    try { await this.account.currentUser(options); return true; }
    catch (error) { if (error?.code === 'AUTHENTICATION_REQUIRED') return false; throw error; }
  }

  async saveSession() { return this.#sessions.snapshot(); }

  async loadSession(snapshot) {
    if (this.#closed) throw closedError();
    if (this.#logoutPromise) throw new ConnectionError('Logout is in progress.', { code: 'LOGGING_OUT', retryable: false });
    await this.#sessions.restore(snapshot, { signal: this.#lifecycle.signal });
    this.#log('info', 'session.restored');
    return this;
  }

  async saveSessionToFile(filepath) {
    const storage = new SessionStorage(filepath);
    await storage.save(await this.saveSession());
    return storage.filepath;
  }

  async loadSessionFromFile(filepath) {
    const snapshot = await new SessionStorage(filepath).load();
    if (!snapshot) return false;
    await this.loadSession(snapshot);
    return true;
  }

  connectRealtime(options) {
    return this.#realtime.connect(options);
  }

  onMessage(filter, handler, options) { return this.#receiving.add('message', filter, handler, options); }
  onMessageEdit(filter, handler, options) { return this.#receiving.add('messageEdit', filter, handler, options); }
  onMessageDelete(filter, handler, options) { return this.#receiving.add('messageUnsend', filter, handler, options); }
  onThreadUpdate(filter, handler, options) { return this.#receiving.add('threadUpdate', filter, handler, options); }
  onUnseenCount(filter, handler, options) { return this.#receiving.add('unseenCount', filter, handler, options); }
  onRawDelta(filter, handler, options) { return this.#receiving.add('raw', filter, handler, options); }
  onHandlerError(handler) { return this.#receiving.onErrorHandler(handler); }
  waitForHandlers() { return this.#receiving.wait(); }

  disconnectRealtime() {
    return this.#realtime.disconnect();
  }

  close() {
    this.#closePromise ??= this.#close();
    return this.#closePromise;
  }

  async #close() {
    this.#closed = true;
    this.off('event', this.#onReceivingEvent);
    this.#receiving.close();
    this.#lifecycle.abort(closedError());
    this.#http.close();
    await Promise.all([
      this.#realtime.close(),
      this.#loginPromise?.catch(() => {}),
      this.#logoutPromise?.catch(() => {}),
    ]);
    this.#log('info', 'client.closed');
  }

  async [Symbol.asyncDispose]() {
    await this.close();
  }
}

function closedError() {
  return new ConnectionError('Client is closed.', { code: 'CLOSED', retryable: false });
}
