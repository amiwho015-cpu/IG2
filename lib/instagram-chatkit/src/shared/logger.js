import { InstagramError, ValidationError } from './errors.js';

const levels = ['debug', 'info', 'warn', 'error'];
const states = new Set(['starting', 'connected', 'reconnecting', 'fatal', 'auth_required', 'stopped']);
const updateTypes = new Set(['message', 'messageEdit', 'messageUnsend', 'threadUpdate', 'unseenCount', 'raw']);

export function errorFields(error) {
  try {
    const fields = { code: 'UNEXPECTED_ERROR' };
    if (!(error instanceof InstagramError)) return fields;
    if (typeof error.code === 'string' && /^[a-z][a-z0-9_]{0,63}$/i.test(error.code)) fields.code = error.code;
    if (Number.isInteger(error.status) && error.status >= 100 && error.status <= 599) fields.status = error.status;
    if (typeof error.retryable === 'boolean') fields.retryable = error.retryable;
    return fields;
  } catch { return { code: 'UNEXPECTED_ERROR' }; }
}

export function createLogger(logger, logLevel = 'info') {
  if (!levels.includes(logLevel)) throw new ValidationError('logLevel must be debug, info, warn or error.');
  if (logger === undefined || logger === false) return () => {};
  if (typeof logger !== 'function' && (!logger || typeof logger !== 'object' ||
      !levels.some(level => typeof logger[level] === 'function') ||
      levels.some(level => logger[level] !== undefined && typeof logger[level] !== 'function'))) {
    throw new ValidationError('logger must be a callback, a logger object or false.');
  }
  const minimum = levels.indexOf(logLevel);
  return (level, event, fields = {}) => {
    if (levels.indexOf(level) < minimum) return;
    try {
      const record = { time: new Date().toISOString(), level, event };
      if (['GET', 'POST'].includes(fields.method)) record.method = fields.method;
      if (Number.isInteger(fields.status) && fields.status >= 100 && fields.status <= 599) record.status = fields.status;
      if (typeof fields.code === 'string' && /^[a-z][a-z0-9_]{0,63}$/i.test(fields.code)) record.code = fields.code;
      if (typeof fields.retryable === 'boolean') record.retryable = fields.retryable;
      if (Number.isFinite(fields.durationMs) && fields.durationMs >= 0) record.durationMs = Math.round(fields.durationMs);
      if (states.has(fields.state)) record.state = fields.state;
      for (const key of ['attempt', 'nextRetryIn']) {
        if (Number.isSafeInteger(fields[key]) && fields[key] >= 0) record[key] = fields[key];
      }
      if (updateTypes.has(fields.updateType)) record.updateType = fields.updateType;
      if (Number.isSafeInteger(fields.group)) record.group = fields.group;
      const result = typeof logger === 'function' ? logger(record) : logger[level]?.(record);
      if (result && typeof result.then === 'function') Promise.resolve(result).catch(() => {});
    } catch {}
  };
}
