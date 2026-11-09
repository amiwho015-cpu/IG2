export class InstagramError extends Error {
  constructor(message, { code = 'INSTAGRAM_ERROR', status, cause, retryable = false } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }

  toJSON() {
    return { name: this.name, message: this.message, code: this.code, status: this.status, retryable: this.retryable };
  }
}

export class ValidationError extends InstagramError {
  constructor(message, options = {}) { super(message, { code: 'VALIDATION_ERROR', ...options }); }
}
export class AuthenticationError extends InstagramError {
  constructor(message = 'Instagram session is expired or requires verification.', options = {}) {
    super(message, { code: 'AUTHENTICATION_REQUIRED', ...options, retryable: false });
  }
}
export class ConnectionError extends InstagramError {
  constructor(message = 'Could not connect to Instagram.', options = {}) {
    super(message, { code: 'CONNECTION_ERROR', retryable: true, ...options });
  }
}
export class TimeoutError extends ConnectionError {
  constructor(message = 'Operation timed out.', options = {}) { super(message, { code: 'TIMEOUT', ...options }); }
}
export class DeliveryUnknownError extends InstagramError {
  constructor(message = 'Delivery status is unknown. Check the conversation before sending again.', options = {}) {
    super(message, { ...options, code: 'DELIVERY_UNKNOWN', retryable: false });
  }
}
