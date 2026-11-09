import { unsupported } from '../shared/response.js';

export class LiveApi {
  async create() { return unsupported('live.create'); }
  async start() { return unsupported('live.start'); }
  async end() { return unsupported('live.end'); }
  async info() { return unsupported('live.info'); }
  async getViewerList() { return unsupported('live.getViewerList'); }
  async comment() { return unsupported('live.comment'); }
  async like() { return unsupported('live.like'); }
  async getHeartbeatAndViewerCount() { return unsupported('live.getHeartbeatAndViewerCount'); }
  async muteComment() { return unsupported('live.muteComment'); }
  async unmuteComment() { return unsupported('live.unmuteComment'); }
}
