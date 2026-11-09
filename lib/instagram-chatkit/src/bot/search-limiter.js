import { CommandError } from './command-input.js';

export class SearchLimiter {
  #requests = [];

  constructor({ clock = Date.now, windowMs = 60_000, perSender = 3, total = 20 } = {}) {
    this.clock = clock;
    this.windowMs = windowMs;
    this.perSender = perSender;
    this.total = total;
  }

  reserve(senderId) {
    const now = this.clock();
    this.#requests = this.#requests.filter(request => request.time > now - this.windowMs);
    if (this.#requests.length >= this.total || this.#requests.filter(request => request.senderId === senderId).length >= this.perSender) {
      throw new CommandError('Đã đạt giới hạn tìm kiếm; thử lại sau một phút.');
    }
    this.#requests.push({ senderId, time: now });
  }
}
