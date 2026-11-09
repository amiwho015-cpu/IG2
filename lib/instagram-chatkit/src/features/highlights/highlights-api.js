import { unsupported } from '../shared/response.js';

export class HighlightsApi {
  async getHighlightsTray() { return unsupported('highlights.getHighlightsTray'); }
  async getHighlight() { return unsupported('highlights.getHighlight'); }
  async create() { return unsupported('highlights.create'); }
  async edit() { return unsupported('highlights.edit'); }
  async delete() { return unsupported('highlights.delete'); }
  async addStories() { return unsupported('highlights.addStories'); }
  async removeStories() { return unsupported('highlights.removeStories'); }
  async updateCover() { return unsupported('highlights.updateCover'); }
}
