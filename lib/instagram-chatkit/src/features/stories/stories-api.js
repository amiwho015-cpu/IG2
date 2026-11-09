import { unsupported } from '../shared/response.js';

export class StoriesApi {
  #highlights;

  constructor(http, { highlights } = {}) {
    this.#highlights = highlights;
  }

  async react() { return unsupported('stories.react'); }
  async getFeed() { return unsupported('stories.getFeed'); }
  async getUser() { return unsupported('stories.getUser'); }
  async upload() { return unsupported('stories.upload'); }
  async uploadVideo() { return unsupported('stories.uploadVideo'); }
  async seen() { return unsupported('stories.seen'); }
  getHighlights(userPk, options) { return this.#highlights.getHighlightsTray(userPk, options); }
  getHighlight(highlightId, options) { return this.#highlights.getHighlight(highlightId, options); }
  async viewers() { return unsupported('stories.viewers'); }
}
