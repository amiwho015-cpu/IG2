import { DeliveryUnknownError, InstagramError, ValidationError } from '../../shared/errors.js';
import { positiveId } from '../../shared/validation.js';
import { checked, restResult, unsupported } from '../shared/response.js';

function userIdList(userPks) {
  if (!Array.isArray(userPks) || !userPks.length || userPks.length > 100) {
    throw new ValidationError('userIds must contain 1-100 Instagram user PKs.');
  }
  return [...new Set(userPks.map(userPk => positiveId(userPk, 'userId')))];
}

function relationship(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InstagramError('Instagram returned an invalid relationship.', { code: 'INVALID_RESPONSE' });
  }
  checked(value);
  return value;
}

function unconfirmed() {
  return new DeliveryUnknownError('Instagram did not confirm the relationship change. Check the account before trying again.');
}

export class FriendshipsApi {
  #http;

  constructor(http) { this.#http = http; }

  async create(userPk, { signal } = {}) {
    return this.#follow(userPk, true, signal);
  }

  async destroy(userPk, { signal } = {}) {
    return this.#follow(userPk, false, signal);
  }

  async #follow(userPk, following, signal) {
    const accountPk = positiveId(userPk, 'userId');
    const payload = checked(await this.#http.graphql(following ? '26508036048874888' : '27789106940691111', {
      target_user_id: accountPk,
      container_module: 'profile',
      nav_chain: 'PolarisProfilePostsTabRoot:profilePage:1:via_cold_start',
    }, { friendlyName: following ? 'usePolarisFollowMutation' : 'usePolarisUnfollowMutation', actor: 'viewer', signal }));
    const result = payload.data?.[following ? 'xdt_create_friendship' : 'xdt_destroy_friendship'];
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw unconfirmed();
    checked(result);
    const status = result.friendship_status;
    if (!status || typeof status !== 'object' || Array.isArray(status)) throw unconfirmed();
    const confirmed = following
      ? status.following === true || status.outgoing_request === true
      : status.following === false && status.outgoing_request !== true;
    if (!confirmed) throw unconfirmed();
    return { status: 'ok', friendship_status: status };
  }

  async approve(userPk, { signal } = {}) {
    return this.#requestDecision('approve', userPk, signal);
  }

  async ignore(userPk, { signal } = {}) {
    return this.#requestDecision('ignore', userPk, signal);
  }

  async #requestDecision(action, userPk, signal) {
    const accountPk = positiveId(userPk, 'userId');
    const payload = restResult(await this.#http.post(`/api/v1/friendships/${action}/${accountPk}/`, {
      user_id: accountPk,
      container_module: 'newsfeed',
    }, { signal, headers: { referer: 'https://www.instagram.com/notifications/' } }));
    const status = payload.friendship_status;
    if (!status || typeof status !== 'object' || Array.isArray(status) || status.incoming_request !== false ||
        status.followed_by !== (action === 'approve')) throw unconfirmed();
    return payload;
  }

  async show(userPk, { signal } = {}) {
    const accountPk = positiveId(userPk, 'userId');
    const payload = await this.showMany([accountPk], { signal });
    return { ...payload.friendship_statuses[accountPk], status: 'ok' };
  }

  async showMany(userPks, { signal } = {}) {
    const accountPks = userIdList(userPks);
    const payload = restResult(await this.#http.post('/api/v1/friendships/show_many/', {
      user_ids: accountPks.join(','),
    }, { signal }));
    const statuses = payload.friendship_statuses;
    if (!statuses || typeof statuses !== 'object' || Array.isArray(statuses)) {
      throw new InstagramError('Instagram did not return relationship statuses.', { code: 'INVALID_RESPONSE' });
    }
    const requested = {};
    for (const accountPk of accountPks) requested[accountPk] = relationship(statuses[accountPk]);
    return { ...payload, friendship_statuses: requested };
  }

  async getPendingRequests({ signal } = {}) {
    const payload = restResult(await this.#http.get('/api/v1/friendships/pending/', { signal }));
    if (!Array.isArray(payload.users)) {
      throw new InstagramError('Instagram did not return pending requests.', { code: 'INVALID_RESPONSE' });
    }
    const users = payload.users.map(user => {
      if (!user || typeof user !== 'object' || Array.isArray(user)) throw new InstagramError('Instagram returned an invalid pending request.', { code: 'INVALID_RESPONSE' });
      let pk;
      try { pk = positiveId(user.pk ?? user.id, 'user PK'); }
      catch { throw new InstagramError('Instagram returned an invalid pending request.', { code: 'INVALID_RESPONSE' }); }
      return { ...user, pk };
    });
    return { ...payload, users };
  }

  async removeFollower() { return unsupported('friendships.removeFollower'); }
  async block() { return unsupported('friendships.block'); }
  async unblock() { return unsupported('friendships.unblock'); }
  async mute() { return unsupported('friendships.mute'); }
  async unmute() { return unsupported('friendships.unmute'); }
}
