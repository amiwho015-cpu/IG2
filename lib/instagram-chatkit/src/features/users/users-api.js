import { ConnectionError, DeliveryUnknownError, InstagramError, ValidationError } from '../../shared/errors.js';
import { boolean, id, positiveId, text } from '../../shared/validation.js';
import { parseCookies } from '../../shared/cookies.js';
import { checked, restResult, unsupported } from '../shared/response.js';
import { webSearch } from '../shared/web-search.js';

function username(value) {
  const result = text(value, 'username').replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9._]{1,30}$/.test(result)) throw new ValidationError('Invalid Instagram username.');
  return result;
}

function invalidUser() {
  return new InstagramError('Instagram returned an invalid user.', { code: 'INVALID_RESPONSE' });
}

function count(value) {
  if (value === undefined || value === null) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) throw invalidUser();
  return value;
}

function nativeUser(user, expectedPk) {
  if (!user || typeof user !== 'object' || Array.isArray(user)) throw invalidUser();
  let pk;
  try { pk = positiveId(user.pk ?? user.id, 'user PK'); } catch { throw invalidUser(); }
  if (expectedPk !== undefined && pk !== expectedPk) throw invalidUser();
  if (typeof user.username !== 'string' || !/^[A-Za-z0-9._]{1,30}$/.test(user.username) ||
      (user.full_name !== undefined && typeof user.full_name !== 'string')) throw invalidUser();
  return {
    ...user, id: pk, pk,
    follower_count: count(user.follower_count ?? user.edge_followed_by?.count),
    following_count: count(user.following_count ?? user.edge_follow?.count),
    media_count: count(user.media_count ?? user.edge_owner_to_timeline_media?.count),
    is_business: user.is_business ?? user.is_business_account,
  };
}

function contact(user, requestedFbid) {
  if (!user || typeof user !== 'object' || Array.isArray(user)) throw invalidUser();
  let contactId = '';
  try {
    const providerFbid = user.interop_messaging_user_fbid;
    if (requestedFbid && providerFbid !== undefined && positiveId(providerFbid, 'messaging FBID') !== requestedFbid) throw invalidUser();
    const candidate = providerFbid ?? requestedFbid ?? user.id ?? user.pk;
    if (candidate !== undefined) contactId = positiveId(candidate, 'contact ID');
    if (user.pk !== undefined) positiveId(user.pk, 'user PK');
  } catch { throw invalidUser(); }
  if (user.username !== undefined && (typeof user.username !== 'string' || !/^[A-Za-z0-9._]{1,30}$/.test(user.username))) throw invalidUser();
  return { ...user, id: contactId, username: user.username ?? '', name: user.full_name || user.username || '', avatar: user.profile_pic_url ?? null };
}

function sessionIdentity(http) {
  const cookies = parseCookies(http.cookies ?? http.session?.cookieIGS ?? '');
  return JSON.stringify([cookies.get('ds_user_id') ?? '', cookies.get('sessionid') ?? '']);
}

function checkSession(http, identity, signal) {
  signal?.throwIfAborted();
  if (sessionIdentity(http) !== identity) {
    throw new ConnectionError('Account session changed during user lookup.', { code: 'SESSION_CHANGED', retryable: false });
  }
}

export class UsersApi {
  #http;
  #friendships;
  #getInboxContext;

  constructor(http, friendships, { getInboxContext } = {}) {
    this.#http = http;
    this.#friendships = friendships;
    this.#getInboxContext = getInboxContext;
  }

  async search(query, { signal } = {}) {
    const keyword = text(query, 'query', { max: 100 }).trim();
    const result = await webSearch(this.#http, keyword, { signal });
    const seen = new Set();
    return result.users.map(item => nativeUser(item.user)).filter(user => {
      if (seen.has(user.pk)) return false;
      seen.add(user.pk);
      return true;
    });
  }

  async searchContacts(query, { signal } = {}) {
    const keyword = text(query, 'query', { max: 100 }).trim();
    const payload = checked(await this.#http.graphql('27248216181454285', { search_text: keyword }, {
      friendlyName: 'IGDOmniPickerSearchResultsListQuery', signal,
    }));
    const contacts = payload.data?.xfb_combinedIGSearchQuery?.search_messenger_contact_v2;
    if (!Array.isArray(contacts)) throw invalidUser();
    const seen = new Set();
    return contacts.filter(user => user && typeof user === 'object' && !Array.isArray(user)).map(user => contact(user)).filter(user => {
      if (!user.id || seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    });
  }

  async infoByUsername(accountUsername, { signal } = {}) {
    const expectedUsername = username(accountUsername).toLowerCase();
    const identity = sessionIdentity(this.#http);
    const users = await this.search(expectedUsername, { signal });
    checkSession(this.#http, identity, signal);
    const matches = users.filter(user => user.username.toLowerCase() === expectedUsername);
    if (matches.length === 0) throw new InstagramError('Instagram did not return the requested user.', { code: 'NOT_FOUND' });
    if (matches.length !== 1) throw invalidUser();
    const user = await this.info(matches[0].pk, { signal });
    checkSession(this.#http, identity, signal);
    if (user.username.toLowerCase() !== expectedUsername) throw invalidUser();
    return user;
  }

  async info(userPk, { signal } = {}) {
    const accountPk = positiveId(userPk, 'userId');
    const payload = checked(await this.#http.graphql('28036671149327607', {
      enable_integrity_filters: true,
      id: accountPk,
      render_surface: 'PROFILE',
      __relay_internal__pv__PolarisCannesGuardianExperienceEnabledrelayprovider: true,
      __relay_internal__pv__PolarisCASB976ProfileEnabledrelayprovider: false,
      __relay_internal__pv__PolarisWebSchoolsEnabledrelayprovider: false,
      __relay_internal__pv__PolarisRepostsConsumptionEnabledrelayprovider: false,
      __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false,
    }, { friendlyName: 'PolarisProfilePageContentQuery', actor: 'account', endpoint: '/graphql/query', signal }));
    if (payload.data?.user === null) throw new InstagramError('Instagram did not return the requested user.', { code: 'NOT_FOUND' });
    return nativeUser(payload.data?.user, accountPk);
  }

  async getFollowers(userPk, maxId = null, { signal } = {}) {
    return this.#connections('followers', userPk, maxId, signal);
  }

  async getFollowing(userPk, maxId = null, { signal } = {}) {
    return this.#connections('following', userPk, maxId, signal);
  }

  async #connections(kind, userPk, maxId, signal) {
    const accountPk = positiveId(userPk, 'userId');
    const query = { count: 50, search_surface: 'follow_list_page' };
    if (maxId !== null) query.max_id = text(id(maxId, 'maxId', { numeric: false }), 'maxId', { max: 2048 });
    const payload = restResult(await this.#http.get(`/api/v1/friendships/${accountPk}/${kind}/`, { query, signal }));
    if (!Array.isArray(payload.users)) throw invalidUser();
    const cursor = payload.next_max_id == null || payload.next_max_id === ''
      ? undefined : text(id(payload.next_max_id, 'next_max_id', { numeric: false }), 'next_max_id', { max: 2048 });
    const more = payload.more_available ?? payload.has_more;
    if (more !== undefined && typeof more !== 'boolean') throw invalidUser();
    if (more === true && !cursor) throw invalidUser();
    return { ...payload, users: payload.users.map(user => nativeUser(user)), next_max_id: cursor, more_available: more ?? Boolean(cursor) };
  }

  async profile(usernameOrMessagingFbid, { signal } = {}) {
    const profileId = id(usernameOrMessagingFbid, 'target', { numeric: false });
    if (!/^\d+$/.test(profileId)) return contact(await this.infoByUsername(profileId, { signal }));
    const messagingFbid = positiveId(profileId, 'messaging user FBID');
    const payload = checked(await this.#http.graphql('35274961328786258', { messaging_user_fbid: messagingFbid }, {
      friendlyName: 'useIGDCreateOptimisticThreadUserQuery', signal,
    }));
    const user = payload.data?.xig_user_from_messaging_user_fbid ?? payload.data?.user;
    if (!user) throw new InstagramError('Instagram did not return the requested messaging profile.', { code: 'NOT_FOUND' });
    return contact(user, messagingFbid);
  }

  follow(userPk, options) { return this.#friendships.create(userPk, options); }
  unfollow(userPk, options) { return this.#friendships.destroy(userPk, options); }
  removeFollower(userPk, options) { return this.#friendships.removeFollower(userPk, options); }

  async block(userPk, enabled = true, options) {
    boolean(enabled, 'enabled');
    return enabled ? this.#friendships.block(userPk, options) : this.#friendships.unblock(userPk, options);
  }

  async bio(biography, { signal } = {}) {
    text(biography, 'biography', { empty: true, max: 150 });
    const identity = sessionIdentity(this.#http);
    const payload = checked(await this.#http.get('/api/v1/accounts/edit/web_form_data/', { signal }));
    checkSession(this.#http, identity, signal);
    const current = payload.form_data;
    if (!current || typeof current !== 'object' || Array.isArray(current) || !current.username) {
      throw new InstagramError('Profile edit form is missing; bio update was cancelled.', { code: 'INVALID_RESPONSE' });
    }
    username(current.username);
    const form = {};
    for (const field of ['first_name', 'username', 'email', 'phone_number', 'external_url']) {
      if (current[field] !== undefined && current[field] !== null) form[field] = String(current[field]);
    }
    if ('chaining_enabled' in current) form.chaining_enabled = current.chaining_enabled ? 'on' : '';
    form.biography = biography;
    const result = restResult(await this.#http.post('/api/v1/web/accounts/edit/', form, { signal }));
    try { checkSession(this.#http, identity, signal); }
    catch (cause) { throw new DeliveryUnknownError(undefined, { cause }); }
    return result;
  }

  async notifications({ signal } = {}) {
    if (!this.#getInboxContext) return unsupported('users.notifications');
    const identity = sessionIdentity(this.#http);
    const context = await this.#getInboxContext({ signal });
    checkSession(this.#http, identity, signal);
    context.checkSession();
    const { fb_dtsg, jazoest } = context.form;
    if (typeof fb_dtsg !== 'string' || !fb_dtsg || typeof jazoest !== 'string' || !/^\d+$/.test(jazoest)) throw invalidUser();
    const payload = await this.#http.post('/api/v1/news/inbox/', { fb_dtsg, jazoest }, {
      signal, headers: { referer: 'https://www.instagram.com/notifications/' },
    });
    checkSession(this.#http, identity, signal);
    context.checkSession();
    return restResult(payload);
  }
}
