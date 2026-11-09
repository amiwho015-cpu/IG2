import { ValidationError } from '../shared/errors.js';
import { validateStoredCookies } from './validate-cookies.js';

export class EnvSessionStorage {
  format = 'cookies';

  constructor(envVar = 'IGCHAT_COOKIES', environment = process.env) {
    if (typeof envVar !== 'string' || !/^[A-Za-z_][\w]*$/.test(envVar)) {
      throw new ValidationError('Invalid environment variable name.');
    }
    this.envVar = envVar;
    this.environment = environment;
  }

  async load() {
    return this.environment[this.envVar] || null;
  }

  async save(cookies) {
    validateStoredCookies(cookies);
    this.environment[this.envVar] = cookies;
  }

  async clear() {
    delete this.environment[this.envVar];
  }
}
