import { text } from '../../shared/validation.js';
import { unsupported } from '../shared/response.js';
import { hashtag, pageQuery } from '../shared/feature-input.js';
import { webSearch } from '../shared/web-search.js';

export class HashtagsApi {
  #http;

  constructor(http) { this.#http = http; }

  async info(hashtagName) {
    hashtag(hashtagName);
    unsupported('hashtags.info');
  }

  async search(query, { signal } = {}) {
    const keyword = text(query, 'query', { max: 100 }).trim();
    const result = await webSearch(this.#http, keyword, { count: 50, signal });
    return { ...result, results: result.hashtags.map(item => item.hashtag) };
  }

  async getFeed(hashtagName, maxId = null) {
    hashtag(hashtagName);
    pageQuery(maxId);
    unsupported('hashtags.getFeed');
  }

  async getStories(hashtagName) {
    hashtag(hashtagName);
    unsupported('hashtags.getStories');
  }

  async follow(hashtagName) {
    hashtag(hashtagName);
    unsupported('hashtags.follow');
  }

  async unfollow(hashtagName) {
    hashtag(hashtagName);
    unsupported('hashtags.unfollow');
  }

  async getRelated(hashtagName) {
    hashtag(hashtagName);
    unsupported('hashtags.getRelated');
  }

  async getFollowing() { unsupported('hashtags.getFollowing'); }
}
