import { AuthenticationError, ConnectionError, DeliveryUnknownError, ValidationError } from '../../shared/errors.js';
import { mergeResponseCookies, parseCookies, serializeCookies } from '../../shared/cookies.js';
import { createLogger, errorFields } from '../../shared/logger.js';
import { buildRequest, graphqlForm, sessionForm } from './request.js';
import { checkHttpStatus, checkProviderError, parseBatchResponse, parseInstagramJson, readResponseText, requestFailure } from './response.js';

function cookieIdentity(cookies) {
  return JSON.stringify([cookies.get('ds_user_id') ?? '', cookies.get('sessionid') ?? '']);
}

export class HttpTransport {
  #cookies;
  #counter = 0;
  #sessionVersion = 0;
  #abort = new AbortController();
  #getWebContext;
  #log;

  constructor({ cookies = '', session, fetch: fetchImplementation = globalThis.fetch, timeoutMs = 30_000, maxResponseBytes = 16 * 1024 * 1024, getWebContext, logger, logLevel } = {}) {
    if (typeof fetchImplementation !== 'function') throw new ValidationError('fetch must be a function.');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new ValidationError('timeoutMs must be a positive integer.');
    if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) throw new ValidationError('maxResponseBytes must be a positive integer.');
    if (getWebContext !== undefined && typeof getWebContext !== 'function') throw new ValidationError('getWebContext must be a function.');
    this.#getWebContext = getWebContext;
    this.#log = createLogger(logger, logLevel);
    this.#cookies = parseCookies(session?.cookieIGS ?? cookies);
    this.session = session;
    this.fetch = fetchImplementation;
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;
  }

  get cookies() {
    return serializeCookies(this.#cookies);
  }

  get signal() { return this.#abort.signal; }

  setCookies(cookies) {
    const replacement = parseCookies(cookies);
    if (cookieIdentity(this.#cookies) !== cookieIdentity(replacement)) this.session = undefined;
    this.#cookies = replacement;
    this.#sessionVersion++;
    if (this.session) this.session.cookieIGS = this.cookies;
  }

  form(extra = {}) {
    const form = sessionForm(this.session, this.#counter + 1, extra);
    this.#counter++;
    return form;
  }

  async #request(method, path, options = {}) {
    if (this.#abort.signal.aborted) {
      throw new ConnectionError('HTTP transport is closed.', { code: 'CLOSED', retryable: false });
    }
    if (options.onResponse !== undefined && typeof options.onResponse !== 'function') {
      throw new ValidationError('onResponse must be a function.');
    }
    const request = buildRequest(method, path, options, {
      cookies: this.cookies,
      csrfToken: this.#cookies.get('csrftoken') ?? this.session?.fb_dtsg ?? '',
    });
    const sessionVersion = this.#sessionVersion;
    const { signal, text = false } = options;
    const timeout = AbortSignal.timeout(this.timeoutMs);
    request.options.signal = AbortSignal.any([this.#abort.signal, timeout, ...(signal ? [signal] : [])]);

    let response;
    let responseText;
    const startedAt = performance.now();
    try {
      response = await this.fetch(request.url, request.options);
      if (sessionVersion !== this.#sessionVersion) {
        await response.body?.cancel();
        this.#sessionChanged(method);
      }
      const previousIdentity = cookieIdentity(this.#cookies);
      mergeResponseCookies(this.#cookies, response.headers);
      if (previousIdentity !== cookieIdentity(this.#cookies)) {
        this.session = undefined;
        this.#sessionVersion++;
      }
      if (this.session) this.session.cookieIGS = this.cookies;
      const responseVersion = this.#sessionVersion;
      await options.onResponse?.({ headers: response.headers, status: response.status });
      await checkHttpStatus(response, method);
      responseText ??= await readResponseText(response, this.maxResponseBytes);
      if (responseVersion !== this.#sessionVersion) this.#sessionChanged(method);
      const payload = text ? responseText : parseInstagramJson(responseText);
      if (!text) checkProviderError(payload, response.status);
      this.#log('debug', 'http.requestCompleted', {
        method, status: response.status, durationMs: Math.round(performance.now() - startedAt),
      });
      return payload;
    } catch (error) {
      const failure = requestFailure(error, { method, signal, closed: this.#abort.signal.aborted, timeout: timeout.aborted });
      this.#log('warn', 'http.requestFailed', {
        ...errorFields(failure), method, status: response?.status,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw failure;
    }
  }

  get(path, options) {
    return this.#request('GET', path, options);
  }

  #sessionChanged(method) {
    const message = 'Account session changed before the request completed.';
    if (method !== 'GET') throw new DeliveryUnknownError(message);
    throw new ConnectionError(message, { code: 'SESSION_CHANGED', retryable: false });
  }

  getText(path, options = {}) {
    return this.#request('GET', path, { ...options, text: true });
  }

  post(path, form, options = {}) {
    return this.#request('POST', path, { ...options, form });
  }

  async postBatch(path, form, options = {}) {
    const text = await this.#request('POST', path, { ...options, form, text: true });
    return parseBatchResponse(text);
  }

  async graphql(docId, variables, { friendlyName = 'IGChatQuery', guard, actor, endpoint = '/api/graphql', ...options } = {}) {
    if (guard !== undefined && typeof guard !== 'function') throw new ValidationError('GraphQL guard must be a function.');
    if (actor !== undefined && !['account', 'viewer'].includes(actor)) throw new ValidationError('Invalid GraphQL actor.');
    if (!['/api/graphql', '/graphql/query'].includes(endpoint)) throw new ValidationError('Invalid GraphQL endpoint.');
    const fields = graphqlForm(docId, variables, friendlyName);
    const sessionVersion = this.#sessionVersion;
    const context = await this.#getWebContext?.({ signal: options.signal });
    if (sessionVersion !== this.#sessionVersion) {
      throw new ConnectionError('Account session changed while preparing the request.', { code: 'SESSION_CHANGED', retryable: false });
    }
    context?.checkSession();
    const form = context ? { ...context.form, ...fields } : this.form(fields);
    if (!context) delete form.av;
    if (actor !== undefined) {
      const actorId = actor === 'viewer' ? context?.actorId : this.#cookies.get('ds_user_id');
      if (typeof actorId !== 'string' || !/^[1-9]\d{0,511}$/.test(actorId)) {
        throw new AuthenticationError('Instagram did not provide the requested web identity.');
      }
      form.av = actorId;
    }
    guard?.();
    const payload = await this.post(endpoint, form, { ...options, headers: { ...context?.headers, ...options.headers, 'x-fb-friendly-name': friendlyName } });
    try { context?.checkSession(); guard?.(); }
    catch (error) { throw new DeliveryUnknownError(undefined, { cause: error }); }
    return payload;
  }

  upload(path, { data, mimeType = 'application/octet-stream', ...options } = {}) {
    if (!(data instanceof Uint8Array) || !data.byteLength) throw new ValidationError('Upload data must be nonempty bytes.');
    return this.#request('POST', path, { ...options, data, headers: { 'content-type': mimeType, ...options.headers } });
  }

  multipart(path, data, options = {}) {
    if (!(data instanceof FormData)) throw new ValidationError('Multipart data must be a FormData instance.');
    return this.#request('POST', path, { ...options, data });
  }

  close() {
    this.#abort.abort(new ConnectionError('HTTP transport is closed.', { code: 'CLOSED', retryable: false }));
  }
}
