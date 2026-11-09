import { ConnectionError, InstagramError, ValidationError } from '../../shared/errors.js';
import { parseCookies } from '../../shared/cookies.js';
import { positiveId } from '../../shared/validation.js';
import { checked, restResult, unsupported } from '../shared/response.js';
import { pageQuery } from '../shared/feature-input.js';

function sessionIdentity(http) {
  const cookies = parseCookies(http.cookies ?? http.session?.cookieIGS ?? '');
  return JSON.stringify([cookies.get('ds_user_id') ?? '', cookies.get('sessionid') ?? '']);
}

export class FeedApi {
  #http;
  #users;

  constructor(http, { users } = {}) {
    this.#http = http;
    this.#users = users;
  }

  async upload() { return unsupported('feed.upload'); }
  async uploadVideo() { return unsupported('feed.uploadVideo'); }
  async uploadCarousel() { return unsupported('feed.uploadCarousel'); }

  async getFeed(maxId = null, { signal } = {}) {
    const payload = restResult(await this.#http.get('/api/v1/feed/timeline/', { query: pageQuery(maxId), signal }));
    if (!Array.isArray(payload.feed_items)) {
      throw new InstagramError('Instagram did not return the feed.', { code: 'INVALID_RESPONSE' });
    }
    return payload;
  }

  async getUserFeed(userPk, maxId = null, { signal } = {}) {
    const userId = positiveId(userPk, 'userId');
    const { max_id: after } = pageQuery(maxId);
    signal?.throwIfAborted();
    if (typeof this.#users?.info !== 'function') throw new ValidationError('User feed requires the users API.');
    const identity = sessionIdentity(this.#http);
    const guard = () => {
      signal?.throwIfAborted();
      if (sessionIdentity(this.#http) !== identity) {
        throw new ConnectionError('Account session changed during feed lookup.', { code: 'SESSION_CHANGED', retryable: false });
      }
    };
    const user = await this.#users.info(userId, { signal });
    guard();
    if (!user || String(user.pk ?? user.id) !== userId ||
        typeof user.username !== 'string' || !/^[A-Za-z0-9._]{1,30}$/.test(user.username)) {
      throw new InstagramError('Instagram did not return the requested feed owner.', { code: 'INVALID_RESPONSE' });
    }
    const variables = {
      data: {
        count: 12,
        include_reel_media_seen_timestamp: true,
        include_relationship_info: true,
        latest_besties_reel_media: true,
        latest_reel_media: true,
      },
      first: 12,
      include_multi_captions: true,
      username: user.username,
      __relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider: true,
      __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: true,
      __relay_internal__pv__PolarisSEOIsCrawlerrelayprovider: false,
      __relay_internal__pv__PolarisThreadsStyleCommentsEnabledrelayprovider: false,
      __relay_internal__pv__PolarisReelsRecoDebugOverlayEnabledrelayprovider: false,
    };
    if (after !== undefined) variables.after = after;
    const payload = checked(await this.#http.graphql('29104886249145907', variables, {
      friendlyName: 'PolarisProfilePostsTabContentQuery_connection',
      actor: 'account',
      guard,
      signal,
    }));
    guard();
    const connection = payload.data?.xdt_api__v1__feed__user_timeline_graphql_connection;
    if (!connection || !Array.isArray(connection.edges) ||
        connection.edges.some(edge => !edge?.node || typeof edge.node !== 'object' || Array.isArray(edge.node)) ||
        typeof connection.page_info?.has_next_page !== 'boolean' ||
        (connection.page_info.end_cursor != null && typeof connection.page_info.end_cursor !== 'string') ||
        (connection.page_info.has_next_page && !connection.page_info.end_cursor)) {
      throw new InstagramError('Instagram did not return the user feed.', { code: 'INVALID_RESPONSE' });
    }
    return {
      status: 'ok',
      items: connection.edges.map(edge => edge.node),
      next_max_id: connection.page_info.end_cursor ?? undefined,
      more_available: connection.page_info.has_next_page,
    };
  }
  async getTag() { return unsupported('feed.getTag'); }
  async getLiked() { return unsupported('feed.getLiked'); }
  async getSaved() { return unsupported('feed.getSaved'); }
  async getLocation() { return unsupported('feed.getLocation'); }
  async getExploreFeed() { return unsupported('feed.getExploreFeed'); }

  async getReelsFeed(maxId = null, { signal } = {}) {
    const { max_id: cursor } = pageQuery(maxId);
    const variables = {
      data: { container_module: 'clips_tab_desktop_page' },
      first: 10,
      __relay_internal__pv__PolarisReelsRecoDebugOverlayEnabledrelayprovider: false,
    };
    if (cursor) Object.assign(variables, {
      after: cursor,
      before: null,
      last: null,
      data: { ...variables.data, seen_reels: '[]' },
    });
    const payload = checked(await this.#http.graphql(cursor ? '28115468621393196' : '27865048666517472', variables, {
      friendlyName: cursor ? 'PolarisClipsTabDesktopPaginationQuery' : 'PolarisClipsTabDesktopContainerQuery',
      actor: 'account',
      signal,
    }));
    const connection = payload.data?.xdt_api__v1__clips__home__connection_v2;
    if (!connection || !Array.isArray(connection.edges) ||
        connection.edges.some(edge => !edge?.node?.media || typeof edge.node.media !== 'object' || Array.isArray(edge.node.media)) ||
        typeof connection.page_info?.has_next_page !== 'boolean' ||
        (connection.page_info.end_cursor != null && typeof connection.page_info.end_cursor !== 'string') ||
        (connection.page_info.has_next_page && !connection.page_info.end_cursor)) {
      throw new InstagramError('Instagram did not return the Reels feed.', { code: 'INVALID_RESPONSE' });
    }
    return {
      status: 'ok',
      items: connection.edges.map(edge => edge.node.media),
      next_max_id: connection.page_info.end_cursor ?? undefined,
      more_available: connection.page_info.has_next_page,
    };
  }
}
