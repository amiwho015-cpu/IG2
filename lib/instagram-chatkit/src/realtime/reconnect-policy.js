import { ValidationError } from '../shared/errors.js';

export class ReconnectPolicy {
  constructor({
    enabled = true,
    initialDelay = 1000,
    maxDelay = 60000,
    multiplier = 2,
    jitter = 0.2,
    maxAttempts = null,
    stableResetAfter = 60000,
    random = Math.random,
  } = {}) {
    if (typeof enabled !== 'boolean' || !Number.isFinite(initialDelay) || initialDelay <= 0 ||
        !Number.isFinite(maxDelay) || maxDelay < initialDelay || !Number.isFinite(multiplier) || multiplier < 1 ||
        !Number.isFinite(jitter) || jitter < 0 || jitter >= 1 ||
        (maxAttempts !== null && (!Number.isSafeInteger(maxAttempts) || maxAttempts < 0)) ||
        !Number.isFinite(stableResetAfter) || stableResetAfter <= 0 || typeof random !== 'function') {
      throw new ValidationError('Invalid reconnect policy. Delays are milliseconds.');
    }
    Object.assign(this, { enabled, initialDelay, maxDelay, multiplier, jitter, maxAttempts, stableResetAfter, random });
  }

  allows(attempt) {
    this.#validate(attempt);
    return this.enabled && (this.maxAttempts === null || attempt <= this.maxAttempts);
  }

  delay(attempt) {
    this.#validate(attempt);
    const exponent = this.multiplier === 1 ? 0 : Math.min(attempt - 1, Math.ceil(Math.log(this.maxDelay / this.initialDelay) / Math.log(this.multiplier)));
    const base = Math.min(this.maxDelay, this.initialDelay * this.multiplier ** exponent);
    return Math.min(this.maxDelay, Math.round(base * (1 - this.jitter + 2 * this.jitter * this.random())));
  }

  #validate(attempt) {
    if (!Number.isSafeInteger(attempt) || attempt < 1) throw new ValidationError('Retry attempt must be a positive integer.');
  }
}
