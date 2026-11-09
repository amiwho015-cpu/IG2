import { randomUUID } from 'node:crypto';
import { AuthenticationError, InstagramError, ValidationError } from '../../shared/errors.js';
import { boolean, positiveId, text } from '../../shared/validation.js';
import { checked, graphqlResult, restResult, unsupported } from '../shared/response.js';
import { pageQuery } from '../shared/feature-input.js';
import { mediaId } from './media-id.js';
import { downloadMedia } from './download-media.js';

export { mediaId } from './media-id.js';

function reactionOptions(options, requestOptions = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new ValidationError('Reaction options must be an object.');
  }
  return {
    moduleName: text(options.module_name ?? 'feed_timeline', 'module_name', { max: 100 }),
    trackingToken: options.trackingToken == null ? null : text(options.trackingToken, 'trackingToken', { max: 8192 }),
    signal: requestOptions?.signal ?? options.signal,
  };
}

function webMediaId(post) {
  return mediaId(post).split('_')[0];
}

function shortcode(postId) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let value = BigInt(postId);
  let result = '';
  while (value) {
    result = alphabet[Number(value % 64n)] + result;
    value /= 64n;
  }
  return result;
}

function confirmedMedia(payload, operation, postId, hasLiked) {
  graphqlResult(payload);
  const media = payload.data['xig_media_' + operation]?.media;
  if (!media || typeof media !== 'object' || Array.isArray(media) ||
      String(media.id).split('_')[0] !== postId ||
      (hasLiked !== undefined && media.has_liked !== hasLiked)) {
    throw new InstagramError('Instagram did not confirm the media operation.', { code: 'UNCONFIRMED_OPERATION' });
  }
  return { ...payload, status: 'ok' };
}

export class MediaApi {
  #http;
  #getInboxContext;

  constructor(http, { getInboxContext } = {}) {
    this.#http = http;
    this.#getInboxContext = getInboxContext;
  }

  async #context(signal) {
    signal?.throwIfAborted();
    if (typeof this.#getInboxContext !== 'function') {
      throw new AuthenticationError('Initialize the web session before changing media.');
    }
    const context = await this.#getInboxContext({ signal });
    signal?.throwIfAborted();
    context.checkSession();
    positiveId(context.actorId, 'actorId');
    return context;
  }

  async download(url, { signal, ...options } = {}) {
    const transportSignal = this.#http.signal;
    transportSignal?.throwIfAborted();
    const downloadSignal = transportSignal
      ? AbortSignal.any([transportSignal, ...(signal ? [signal] : [])])
      : signal;
    return downloadMedia(this.#http.fetch, url, { ...options, signal: downloadSignal });
  }

  async info(post, { signal } = {}) {
    const postId = webMediaId(post);
    const payload = checked(await this.#http.graphql('27128499623469141', {
      shortcode: shortcode(postId),
      __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false,
    }, { friendlyName: 'PolarisPostRootQuery', endpoint: '/graphql/query', actor: 'account', signal }));
    const result = payload.data?.xdt_api__v1__media__shortcode__web_info;
    if (!result || !Array.isArray(result.items) || !result.items.length ||
        result.items.some(item => !item || typeof item !== 'object' || Array.isArray(item) ||
          String(item.pk ?? item.id).split('_')[0] !== postId)) {
      throw new InstagramError('Instagram did not return media information.', { code: 'INVALID_RESPONSE' });
    }
    return { ...result, status: 'ok' };
  }

  async like(post, options, requestOptions = {}) {
    if (options === false) return this.unlike(post, requestOptions);
    if (options === true || options === undefined) options = requestOptions;
    return this.#reaction('like', post, reactionOptions(options, requestOptions));
  }

  async unlike(post, options = {}, requestOptions = {}) {
    return this.#reaction('unlike', post, reactionOptions(options, requestOptions));
  }

  async #reaction(action, post, { moduleName, trackingToken, signal }) {
    const postId = webMediaId(post);
    const context = await this.#context(signal);
    const input = {
      actor_id: context.actorId,
      client_mutation_id: randomUUID(),
      media_id: postId,
      tracking_token: trackingToken,
    };
    if (action === 'like') input.container_module = moduleName;
    const payload = await this.#http.graphql(action === 'like' ? '27182485238052618' : '27345296031770102', { input }, {
      friendlyName: action === 'like' ? 'usePolarisLikeMediaXIGLikeMutation' : 'usePolarisLikeMediaXIGUnlikeMutation',
      actor: 'viewer',
      guard: context.checkSession,
      signal,
    });
    return confirmedMedia(payload, action, postId, action === 'like');
  }

  async comment(post, content, { replyToCommentId, signal } = {}) {
    const postId = webMediaId(post);
    const form = { comment_text: text(content, 'commentText', { max: 2200 }).trim() };
    if (replyToCommentId !== undefined) form.replied_to_comment_id = positiveId(replyToCommentId, 'replyToCommentId');
    const payload = restResult(await this.#http.post('/api/v1/web/comments/' + postId + '/add/', form, { signal }));
    const commentId = payload.id ?? payload.comment?.pk ?? payload.comment?.id;
    if (!['string', 'number', 'bigint'].includes(typeof commentId) || !/^[1-9]\d*$/.test(String(commentId)) ||
        (typeof commentId === 'number' && !Number.isSafeInteger(commentId))) {
      throw new InstagramError('Instagram did not return the added comment.', { code: 'UNCONFIRMED_OPERATION' });
    }
    return payload;
  }

  async deleteComment(post, commentId, { signal } = {}) {
    const postId = webMediaId(post);
    const targetId = positiveId(commentId, 'commentId');
    return restResult(await this.#http.post('/api/v1/web/comments/' + postId + '/delete/' + targetId + '/', {}, { signal }));
  }

  async delete() { return unsupported('media.delete'); }
  async edit() { return unsupported('media.edit'); }
  async seen() { return unsupported('media.seen'); }

  async likers(post, { signal } = {}) {
    const payload = restResult(await this.#http.get('/api/v1/media/' + webMediaId(post) + '/likers/', { signal }));
    if (!Array.isArray(payload.users)) {
      throw new InstagramError('Instagram did not return media likers.', { code: 'INVALID_RESPONSE' });
    }
    return payload;
  }

  async comments(post, maxId = null, { signal } = {}) {
    const postId = webMediaId(post);
    const { max_id: after } = pageQuery(maxId);
    const variables = {
      media_id: postId,
      first: 12,
      last: null,
      before: null,
      sort_order: 'recent',
      __relay_internal__pv__PolarisIsLoggedInrelayprovider: false,
    };
    if (after !== undefined) variables.after = after;
    const payload = checked(await this.#http.graphql('25516980651312394', variables, {
      friendlyName: 'PolarisPostCommentsPaginationQuery',
      actor: 'account',
      endpoint: '/api/graphql',
      signal,
    }));
    const connection = payload.data?.xdt_api__v1__media__media_id__comments__connection;
    if (!connection || !Array.isArray(connection.edges) ||
        typeof connection.page_info?.has_next_page !== 'boolean' ||
        (connection.page_info.end_cursor != null && typeof connection.page_info.end_cursor !== 'string') ||
        (connection.page_info.has_next_page && !connection.page_info.end_cursor)) {
      throw new InstagramError('Instagram did not return media comments.', { code: 'INVALID_RESPONSE' });
    }
    const comments = connection.edges.map(edge => {
      const comment = edge?.node;
      if (!comment || typeof comment !== 'object' || Array.isArray(comment)) {
        throw new InstagramError('Instagram returned an invalid comment.', { code: 'INVALID_RESPONSE' });
      }
      let pk;
      try { pk = positiveId(comment.pk, 'comment PK'); }
      catch { throw new InstagramError('Instagram returned an invalid comment ID.', { code: 'INVALID_RESPONSE' }); }
      return { ...comment, pk };
    });
    return {
      status: 'ok',
      comments,
      next_max_id: connection.page_info.end_cursor ?? undefined,
      has_more_comments: connection.page_info.has_next_page,
    };
  }

  async save(post, enabled = true, { signal, loggingInfoToken } = {}) {
    boolean(enabled, 'enabled');
    const postId = webMediaId(post);
    const token = loggingInfoToken == null ? null : text(loggingInfoToken, 'loggingInfoToken', { max: 8192 });
    const context = await this.#context(signal);
    const input = { actor_id: context.actorId, client_mutation_id: randomUUID(), media_id: postId };
    if (enabled) Object.assign(input, {
      container_module: 'feed_timeline',
      inventory_source: 'media_or_ad',
      logging_info_token: token,
      nav_chain: 'PolarisFeedRoot:feedPage:1:via_cold_start',
    });
    const payload = await this.#http.graphql(enabled ? '27365486596441074' : '27371251859134880', { input }, {
      friendlyName: enabled ? 'usePolarisSaveMediaSaveMutation' : 'usePolarisSaveMediaUnsaveMutation',
      actor: 'viewer',
      guard: context.checkSession,
      signal,
    });
    return confirmedMedia(payload, enabled ? 'save' : 'unsave', postId);
  }

  async publishPhoto() { return unsupported('media.publishPhoto'); }
  async deleteCometStory() { return unsupported('media.deleteCometStory'); }
  async archiveCometStory() { return unsupported('media.archiveCometStory'); }
}
