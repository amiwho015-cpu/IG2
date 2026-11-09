import { InstagramError } from '../../shared/errors.js';

export function unsupported(operation) {
  throw new InstagramError(`${operation} is not available in the Instagram web client.`, { code: 'UNSUPPORTED_OPERATION' });
}

export function checked(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new InstagramError('Instagram returned an invalid response.', { code: 'INVALID_RESPONSE' });
  }

  const hasErrors = Array.isArray(payload.errors)
    ? payload.errors.length > 0
    : payload.errors && Object.keys(payload.errors).length > 0;
  if (payload.error || payload.status === 'fail' || payload.success === false || hasErrors) {
    throw new InstagramError('Instagram rejected the operation.', { code: 'API_ERROR' });
  }
  return payload;
}

export function restResult(payload) {
  checked(payload);
  if (payload.status !== 'ok') {
    throw new InstagramError('Instagram did not confirm the operation.', { code: 'UNCONFIRMED_OPERATION' });
  }
  return payload;
}

function containsValue(value) {
  if (value && typeof value === 'object') return Object.values(value).some(containsValue);
  return value !== null && value !== undefined && value !== false && value !== '';
}

function containsFailure(value) {
  if (!value || typeof value !== 'object') return false;
  const failedSuccessFlag = Object.hasOwn(value, 'success') && [false, 0, '0', 'false'].includes(value.success);
  const failedStatus = ['fail', 'failed', 'error'].includes(String(value.status).toLowerCase());
  const hasErrors = Array.isArray(value.errors) && value.errors.length > 0;
  return failedSuccessFlag || failedStatus || Boolean(value.error) || hasErrors || Object.values(value).some(containsFailure);
}

export function graphqlResult(payload) {
  checked(payload);
  if (!payload.data || typeof payload.data !== 'object' || !containsValue(payload.data) || containsFailure(payload.data)) {
    throw new InstagramError('Instagram did not return the expected mutation data.', { code: 'UNCONFIRMED_OPERATION' });
  }
  return payload;
}

export function legacyResult(payload) {
  checked(payload);
  if (payload.status !== 'ok' && !Object.hasOwn(payload, 'payload')) {
    throw new InstagramError('Instagram did not acknowledge the operation.', { code: 'UNCONFIRMED_OPERATION' });
  }
  return payload;
}
