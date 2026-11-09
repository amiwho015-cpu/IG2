import { AuthenticationError, ConnectionError, InstagramError, ValidationError } from '../shared/errors.js';
import { parseCookies } from '../shared/cookies.js';
import { validateSessionSnapshot } from '../shared/session-snapshot.js';
import { createSession, validateSession } from '../auth/session.js';

function sessionSnapshot(input) {
  if (typeof input === 'string') {
    try { input = JSON.parse(input); }
    catch { throw new ValidationError('Session is not valid JSON.'); }
  }
  return validateSessionSnapshot(input);
}

export class SessionManager {
  #http;
  #onAccountChange;
  #revision = 0;

  constructor(http, { storage, onAccountChange = async () => {} } = {}) {
    if (http.session) validateSession(http.session);
    this.#http = http;
    this.storage = storage;
    this.#onAccountChange = onAccountChange;
  }

  async authenticate({ username, password, signal } = {}) {
    if (username !== undefined || password !== undefined) {
      throw new InstagramError('Password login is unavailable. Provide browser cookies or a saved web session.', { code: 'UNSUPPORTED_OPERATION' });
    }
    const revision = this.#revision;
    let identity = this.#identity();
    const storage = this.storage;
    this.#guard(revision, identity, signal);
    if (!this.#http.cookies) {
      const stored = await storage?.load?.();
      this.#guard(revision, identity, signal);
      if (typeof stored === 'string' && !stored.trimStart().startsWith('{')) {
        this.#http.setCookies(stored);
      } else if (stored) {
        await this.#applySnapshot(sessionSnapshot(stored), revision, identity, signal);
      }
      identity = this.#identity();
    }
    if (!parseCookies(this.#http.cookies).get('sessionid')) {
      throw new AuthenticationError('Provide browser cookies or a saved web session.');
    }

    const session = await createSession(this.#http, { signal });
    this.#guard(revision, identity, signal);
    if (storage) {
      await storage.save(storage.format === 'cookies' ? this.#http.cookies : this.snapshot());
    }
    this.#guard(revision, identity, signal);
    session.cookieIGS = this.#http.cookies;
    this.#http.session = session;
    return session;
  }

  snapshot() {
    return validateSessionSnapshot({ version: 2, cookies: this.#http.cookies });
  }

  async restore(input, { signal } = {}) {
    signal?.throwIfAborted();
    const snapshot = sessionSnapshot(input);
    const revision = ++this.#revision;
    await this.#applySnapshot(snapshot, revision, this.#identity(), signal);
  }

  async #applySnapshot(snapshot, revision, identity, signal) {
    const nextIdentity = this.#identity(snapshot.cookies);
    if (identity !== nextIdentity) await this.#onAccountChange();
    this.#guard(revision, identity, signal);
    this.#http.setCookies(snapshot.cookies);
    this.#http.session = undefined;
  }

  #identity(cookies = this.#http.cookies) {
    const parsed = parseCookies(cookies);
    return JSON.stringify([parsed.get('sessionid') ?? '', parsed.get('ds_user_id') ?? '']);
  }

  #guard(revision, identity, signal) {
    signal?.throwIfAborted();
    if (revision !== this.#revision || identity !== this.#identity()) {
      throw new ConnectionError('Session changed during authentication.', { code: 'SESSION_CHANGED', retryable: false });
    }
  }

  invalidate() { this.#revision++; }
}
