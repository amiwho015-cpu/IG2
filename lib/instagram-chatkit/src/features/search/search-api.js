import { ValidationError } from '../../shared/errors.js';
import { boundedInteger, text } from '../../shared/validation.js';
import { unsupported } from '../shared/response.js';
import { coordinates } from '../shared/feature-input.js';
import { webSearch } from '../shared/web-search.js';

export class SearchApi {
  #http;

  constructor(http) { this.#http = http; }

  async all(query, { searchType = 'blended', ...options } = {}) {
    if (searchType !== 'blended') throw new ValidationError('Only blended top search is supported by this endpoint.');
    return webSearch(this.#http, query, options);
  }

  async users(query, count = 30, { signal } = {}) {
    const result = await webSearch(this.#http, query, { count, signal });
    return { ...result, users: result.users.map(item => item.user) };
  }

  async hashtags(query, count = 30, { signal } = {}) {
    text(query, 'query', { max: 100 });
    const result = await webSearch(this.#http, query, { count, signal });
    return { ...result, results: result.hashtags.map(item => item.hashtag) };
  }

  async locations(query, lat = null, lng = null, count = 30, { signal } = {}) {
    const position = coordinates(lat, lng, { optional: true });
    const keyword = text(query, 'query', { empty: Object.keys(position).length > 0, max: 200 }).trim();
    boundedInteger(count, 'count', 1, 100);
    if (Object.keys(position).length) unsupported('search.locations with coordinates');
    const result = await webSearch(this.#http, keyword, { count, signal });
    return { ...result, venues: result.places.map(item => item.place.location) };
  }

  async recent() { unsupported('search.recent'); }

  async clearHistory() { unsupported('search.clearHistory'); }

  async suggestedUsers() { unsupported('search.suggestedUsers'); }

  async suggestedHashtags() { unsupported('search.suggestedHashtags'); }
}
