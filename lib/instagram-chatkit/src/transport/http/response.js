import { AuthenticationError, ConnectionError, DeliveryUnknownError, InstagramError, TimeoutError } from '../../shared/errors.js';

const AUTH_CODES = new Set(['login_required', 'checkpoint_required', 'challenge_required', 'user_has_logged_out']);

export function parseInstagramJson(text) {
  try {
    const result = JSON.parse(text.trim().replace(/^for\s*\(;;\);\s*/, ''), (_key, value, context) => {
      return typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)
        ? context.source : value;
    });
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch {
    throw new InstagramError('Instagram returned invalid JSON.', { code: 'INVALID_RESPONSE' });
  }
}

export function checkProviderError(payload, status) {
  if (payload.two_factor_required) {
    throw new AuthenticationError('Instagram requires a two-factor challenge.', { code: 'TWO_FACTOR_REQUIRED', status });
  }
  if (['bad_password', 'invalid_user'].includes(payload.error_type)) {
    throw new AuthenticationError('Instagram rejected the login credentials.', { code: 'LOGIN_FAILED', status });
  }
  if (payload.authenticated === false || payload.require_login || payload.checkpoint_url || payload.challenge ||
      AUTH_CODES.has(payload.message) || AUTH_CODES.has(payload.error_type)) {
    throw new AuthenticationError(undefined, { status });
  }
  if (payload.status === 'fail' || payload.error || payload.errors?.length) {
    throw new InstagramError('Instagram rejected the request.', { code: 'PROVIDER_ERROR', status });
  }
}

export async function checkHttpStatus(response, method) {
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new AuthenticationError('Instagram redirected the authenticated request. Refresh the session.', { status: response.status });
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    throw new AuthenticationError(undefined, { status: response.status });
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new InstagramError(`Instagram returned HTTP ${response.status}.`, {
      code: response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR',
      status: response.status,
      retryable: method === 'GET' && (response.status === 429 || response.status >= 500),
    });
  }
}

export async function readResponseText(response, maximumBytes) {
  const length = Number(response.headers.get('content-length'));
  if (length > maximumBytes) {
    await response.body?.cancel();
    throw new InstagramError('Response exceeds the configured size limit.', { code: 'RESPONSE_TOO_LARGE' });
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new InstagramError('Response exceeds the configured size limit.', { code: 'RESPONSE_TOO_LARGE' });
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export function parseBatchResponse(text) {
  const envelopes = text.trim().split(/\r?\n/).filter(line => line.trim()).map(parseInstagramJson);
  if (!envelopes.length) {
    throw new InstagramError('Instagram returned an empty batch.', { code: 'INVALID_RESPONSE' });
  }
  for (const envelope of envelopes) checkProviderError(envelope, 200);
  return envelopes;
}

export function requestFailure(error, { method, signal, closed, timeout }) {
  if (error instanceof InstagramError) return error;
  if (signal?.aborted) return signal.reason ?? error;
  if (closed) return new ConnectionError('HTTP transport is closed.', { code: 'CLOSED', retryable: false });
  if (method !== 'GET') return new DeliveryUnknownError(undefined, { cause: error });
  if (timeout) return new TimeoutError(undefined, { cause: error });
  return new ConnectionError(undefined, { cause: error });
}
