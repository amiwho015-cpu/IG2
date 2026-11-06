/*
 * Author: Tanvir Ahmed (tanvir143)
 * File Name: builder.js
 */

'use strict';

class StoryBuilder {
  constructor(background) {
    this.spec = {
      backgroundPath: background || null,
      caption: '',
      captionOptions: {},
      mentions: [],
      links: [],
      hashtags: [],
      locations: [],
      medias: [],
      stickers: [],
      polls: [],
    };
  }

  background(bgPath) {
    this.spec.backgroundPath = bgPath;
    return this;
  }

  caption(text, options) {
    this.spec.caption = text || '';
    this.spec.captionOptions = options || {};
    return this;
  }

  mention(userOrUsername, options) {
    const opts = options || {};
    const entry = typeof userOrUsername === 'object' && userOrUsername !== null
      ? { ...userOrUsername }
      : (/^\d+$/.test(String(userOrUsername)) ? { userId: String(userOrUsername) } : { username: String(userOrUsername) });
    this.spec.mentions.push({ x: 0.5, y: 0.2, width: 0.3, height: 0.1, ...opts, ...entry });
    return this;
  }

  link(url, options) {
    const opts = options || {};
    this.spec.links.push({ webUri: String(url), x: 0.5, y: 0.1, width: 0.3, height: 0.1, ...opts });
    return this;
  }

  hashtag(tag, options) {
    const opts = options || {};
    this.spec.hashtags.push({ hashtag: String(tag).replace(/^#/, ''), x: 0.5, y: 0.3, width: 0.3, height: 0.1, ...opts });
    return this;
  }

  location(locationObj, options) {
    const opts = options || {};
    this.spec.locations.push({ ...(locationObj || {}), x: 0.5, y: 0.4, width: 0.3, height: 0.1, ...opts });
    return this;
  }

  media(mediaPk, options) {
    const opts = options || {};
    this.spec.medias.push({ mediaPk: String(mediaPk), x: 0.5, y: 0.5, width: 0.4, height: 0.4, ...opts });
    return this;
  }

  sticker(sticker, options) {
    this.spec.stickers.push({ ...(sticker || {}), ...(options || {}) });
    return this;
  }

  build() {
    return {
      backgroundPath: this.spec.backgroundPath,
      caption: this.spec.caption,
      captionOptions: this.spec.captionOptions,
      mentions: this.spec.mentions.slice(),
      links: this.spec.links.slice(),
      hashtags: this.spec.hashtags.slice(),
      locations: this.spec.locations.slice(),
      medias: this.spec.medias.slice(),
      stickers: this.spec.stickers.slice(),
      polls: this.spec.polls.slice(),
    };
  }
}

function storyBuilder(background) {
  return new StoryBuilder(background);
}

module.exports = { StoryBuilder, storyBuilder };