import { id, text } from '../../shared/validation.js';
import { unsupported } from '../shared/response.js';
import { coordinates, pageQuery } from '../shared/feature-input.js';
import { webSearch } from '../shared/web-search.js';

export class LocationsApi {
  #http;

  constructor(http) { this.#http = http; }

  async info(locationId) {
    id(locationId, 'locationId');
    unsupported('locations.info');
  }

  async search(query, lat = null, lng = null, { signal } = {}) {
    const position = coordinates(lat, lng, { optional: true });
    const keyword = text(query, 'query', { empty: Object.keys(position).length > 0, max: 200 }).trim();
    if (Object.keys(position).length) unsupported('locations.search with coordinates');
    const result = await webSearch(this.#http, keyword, { signal });
    return { ...result, venues: result.places.map(item => item.place.location) };
  }

  async searchByCoordinates(lat, lng) {
    coordinates(lat, lng);
    unsupported('locations.searchByCoordinates');
  }

  async getFeed(locationId, maxId = null) {
    id(locationId, 'locationId');
    pageQuery(maxId);
    unsupported('locations.getFeed');
  }

  async getStories(locationId) {
    id(locationId, 'locationId');
    unsupported('locations.getStories');
  }

  async getRelated(locationId) {
    id(locationId, 'locationId');
    unsupported('locations.getRelated');
  }
}
