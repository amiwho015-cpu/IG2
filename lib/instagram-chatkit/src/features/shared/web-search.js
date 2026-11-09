import { InstagramError } from '../../shared/errors.js';
import { boundedInteger, text } from '../../shared/validation.js';
import { checked } from './response.js';

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function webSearch(http, query, { count = 30, rankToken = '', signal } = {}) {
  const keyword = text(query, 'query', { max: 200 }).trim();
  boundedInteger(count, 'count', 1, 100);
  const rank = text(rankToken, 'rankToken', { empty: true, max: 256 });
  const payload = checked(await http.graphql('27706427925724183', {
    data: { context: 'blended', include_reel: 'true', query: keyword, rank_token: rank, search_surface: 'web_top_search' },
    hasQuery: true,
  }, { friendlyName: 'PolarisSearchBoxRefetchableQuery', actor: 'account', endpoint: '/graphql/query', signal }));
  const result = payload.data?.xdt_api__v1__fbsearch__topsearch_connection;
  if (!object(result) || !['users', 'hashtags', 'places'].every(key => Array.isArray(result[key])) ||
      !result.users.every(item => object(item) && object(item.user)) ||
      !result.hashtags.every(item => object(item) && object(item.hashtag)) ||
      !result.places.every(item => object(item) && object(item.place) && object(item.place.location))) {
    throw new InstagramError('Instagram returned invalid search results.', { code: 'INVALID_RESPONSE' });
  }
  return { ...result, status: 'ok', users: result.users.slice(0, count), hashtags: result.hashtags.slice(0, count), places: result.places.slice(0, count) };
}
