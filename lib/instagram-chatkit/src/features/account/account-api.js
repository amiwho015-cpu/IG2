import { unsupported } from '../shared/response.js';

export class AccountApi {
  #getWebUser;
  #onLogout;

  constructor(http, { getWebUser, onLogout = () => {
    http.setCookies('');
    http.session = undefined;
  } } = {}) {
    this.#getWebUser = getWebUser;
    this.#onLogout = onLogout;
  }

  static createJazoest() { return unsupported('account.createJazoest'); }
  encryptPassword() { return unsupported('account.encryptPassword'); }
  async login() { return unsupported('account.login'); }
  async syncLoginExperiments() { return unsupported('account.syncLoginExperiments'); }
  async sendRecoveryFlowEmail() { return unsupported('account.sendRecoveryFlowEmail'); }
  async sendRecoveryFlowSms() { return unsupported('account.sendRecoveryFlowSms'); }

  async logout({ signal } = {}) {
    signal?.throwIfAborted();
    await this.#onLogout({ signal });
    return { status: 'ok', scope: 'local' };
  }

  async currentUser({ signal } = {}) {
    signal?.throwIfAborted();
    if (!this.#getWebUser) return unsupported('account.currentUser');
    const user = await this.#getWebUser({ signal });
    return { status: 'ok', user };
  }
}
