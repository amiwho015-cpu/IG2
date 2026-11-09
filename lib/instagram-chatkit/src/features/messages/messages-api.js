import { DeliveryUnknownError, InstagramError, ValidationError } from '../../shared/errors.js';
import { boolean, id, positiveId, text } from '../../shared/validation.js';
import { checked } from '../shared/response.js';
import { validateWebPhoto } from '../media/mercury-upload.js';
import { findInboxThread, messagingThreadFromInbox, threadFromLookup } from '../threads/thread-identifiers.js';
import { broadcastPayload } from './broadcast-payload.js';
import { readMedia } from './local-media.js';
import { textMessageData, threadingId, webMessageId } from './message-payloads.js';
import { uploadWebAttachment, validateAttachment } from './web-attachment-upload.js';

export { threadingId } from './message-payloads.js';

export class MessagesApi {
  #http;
  #users;
  #threads;
  #getInboxContext;

  constructor(http, _rest, { users, threads, getInboxContext } = {}) {
    this.#http = http;
    this.#users = users;
    this.#threads = threads;
    this.#getInboxContext = getInboxContext;
  }

  async sendPhoto(nativeThreadId, data, { mimeType = 'image/jpeg', signal } = {}) {
    const native = positiveId(nativeThreadId, 'nativeThreadId');
    validateWebPhoto(data, mimeType);
    if (typeof this.#getInboxContext !== 'function') throw new ValidationError('Web messaging context is required. Use InstagramClient.');
    const context = await this.#getInboxContext({ signal });
    const threadFbid = messagingThreadFromInbox(context.result, native);
    return this.#publishMedia(threadFbid, data, context, { mimeType, signal });
  }

  async sendVideo(nativeThreadId, data, { mimeType = 'video/mp4', signal } = {}) {
    return this.#sendNativeMedia(nativeThreadId, data, { mimeType, signal }, 'video/');
  }

  async sendVoice(nativeThreadId, data, { mimeType = 'audio/mp4', signal } = {}) {
    return this.#sendNativeMedia(nativeThreadId, data, { mimeType, voice: true, signal }, 'audio/');
  }

  async #sendNativeMedia(threadId, data, options, prefix) {
    const nativeThreadId = positiveId(threadId, 'nativeThreadId');
    validateAttachment(data, options.mimeType, options.voice ?? false);
    if (!options.mimeType.startsWith(prefix)) throw new ValidationError('The media MIME type does not match the send method.');
    const { fbid, context } = await this.#thread(nativeThreadId, options.signal);
    return this.#publishMedia(fbid, data, context, options);
  }

  async #publishMedia(threadFbid, data, context, { mimeType, voice = false, signal }) {
    context.checkSession();
    const { attachmentId } = await uploadWebAttachment(this.#http, data, { context, mimeType, voice, signal });
    context.checkSession();
    const offlineId = threadingId();
    const payload = checked(await this.#http.post('/api/graphql', {
      ...context.form,
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'IGDirectMediaSendMutation',
      server_timestamps: 'true',
      doc_id: '25766288509716264',
      variables: JSON.stringify({
        attachment_fbid: attachmentId,
        reply_to_message_id: null,
        forwarded_from_thread_id: null,
        is_forwarded_from_own_message: null,
        offline_threading_id: offlineId,
        thread_id: threadFbid,
      }),
    }, {
      signal,
      headers: { ...context.headers, 'x-fb-friendly-name': 'IGDirectMediaSendMutation' },
    }));
    try { context.checkSession(); }
    catch (error) { throw new DeliveryUnknownError(undefined, { cause: error }); }
    const messageId = payload.data?.xig_direct_media_send_with_slide_messaging_response?.message_id;
    if (typeof messageId !== 'string' || !messageId || messageId.length > 512 || /[\s\u0000-\u001f\u007f]/.test(messageId)) {
      throw new DeliveryUnknownError('Instagram did not confirm delivery of the attachment. Check the conversation before sending again.');
    }
    return { messageId, offlineThreadingId: offlineId };
  }

  async #recipientThread(username, signal) {
    const recipientUsername = text(username, 'username', { max: 31 }).replace(/^@/, '');
    if (!/^[A-Za-z0-9._]{1,30}$/.test(recipientUsername)) throw new ValidationError('username must be an Instagram username.');
    const webContext = await this.#context(signal);
    const profile = await this.#users.infoByUsername(recipientUsername, { signal });
    const user = profile?.user ?? profile;
    const recipientPk = positiveId(user?.pk ?? user?.id, 'recipient Instagram user PK');
    const threadId = threadFromLookup(await this.#threads.getByParticipants([recipientPk], { signal }));
    webContext.checkSession();
    return threadId;
  }

  async sendToUser(username, content, { clientContext, signal } = {}) {
    const message = text(content, 'message', { max: 10000 });
    const offlineId = this.#sendContext(clientContext);
    const recipientUsername = text(username, 'username', { max: 31 }).replace(/^@/, '');
    if (!/^[A-Za-z0-9._]{1,30}$/.test(recipientUsername)) throw new ValidationError('username must be an Instagram username.');
    const webContext = await this.#context(signal);
    const profile = await this.#users.infoByUsername(recipientUsername, { signal });
    const user = profile.user ?? profile;
    const recipientPk = positiveId(user.pk ?? user.id, 'recipient user PK');
    const variables = textMessageData('1', message, offlineId);
    variables.ig_thread_igid = null;
    variables.recipient_igids = [recipientPk];
    webContext.checkSession();
    const sent = await this.#sendText(variables, signal, webContext.checkSession);
    return this.#nativeResult(sent);
  }

  async sendImageToUser(username, imagePath, { caption = '', clientContext, signal } = {}) {
    text(caption, 'caption', { empty: true, max: 2200 });
    if (caption) throw unsupported('This web photo mutation does not support an inline caption.');
    const offlineId = this.#sendContext(clientContext);
    const file = await readMedia(imagePath, signal);
    const mimeType = file[0] === 0x89 ? 'image/png' : 'image/jpeg';
    validateWebPhoto(file, mimeType);
    const threadId = await this.#recipientThread(username, signal);
    const { fbid: threadFbid, context: webContext } = await this.#thread(threadId, signal);
    webContext.checkSession();
    const uploaded = await this.upload(file, { mimeType, signal });
    webContext.checkSession();
    const sent = await this.sendAttachment(threadFbid, {
      attachmentId: uploaded.uploadId,
      clientContext: offlineId,
      signal,
      guard: webContext.checkSession,
    });
    return this.#nativeResult(sent, threadId);
  }

  async sendVideoToUser(username, videoPath, { caption = '', durationMs, width, height, clientContext, signal } = {}) {
    text(caption, 'caption', { empty: true, max: 2200 });
    if (caption) throw unsupported('This web media mutation does not support an inline caption.');
    const offlineId = this.#sendContext(clientContext);
    for (const [name, value] of Object.entries({ durationMs, width, height })) {
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new ValidationError(name + ' must be a nonnegative integer.');
    }
    const video = await readMedia(videoPath, signal);
    const threadId = await this.#recipientThread(username, signal);
    const { fbid: threadFbid, context: webContext } = await this.#thread(threadId, signal);
    webContext.checkSession();
    const uploaded = await this.upload(video, { mimeType: 'video/mp4', signal });
    webContext.checkSession();
    const sent = await this.sendAttachment(threadFbid, {
      attachmentId: uploaded.uploadId,
      type: 'video',
      clientContext: offlineId,
      signal,
      guard: webContext.checkSession,
    });
    return this.#nativeResult(sent, threadId);
  }

  async broadcast({ query, signal, ...options } = {}) {
    const { type } = broadcastPayload(options);
    if (type !== 'text') throw unsupported('REST media broadcasts are unavailable. Use upload() and sendAttachment() with a Mercury attachment ID.');
    if (query !== undefined || options.signed) throw unsupported('Web text sends do not support REST query/signature options.');
    if (Object.keys(options.form ?? {}).some(key => key !== 'text')) throw new ValidationError('Web text broadcasts accept only the text form field.');
    if (options.threadIds !== undefined) {
      const nativeThreadIds = Array.isArray(options.threadIds) ? options.threadIds : [options.threadIds];
      if (nativeThreadIds.length !== 1) throw unsupported('A web text send targets one conversation at a time.');
      return this.sendToGroup(nativeThreadIds[0], options.form.text, { clientContext: options.clientContext, signal });
    }
    const offlineId = this.#sendContext(options.clientContext);
    const recipientPks = Array.isArray(options.userIds) ? options.userIds : [options.userIds];
    const variables = textMessageData('1', options.form.text, offlineId);
    variables.ig_thread_igid = null;
    variables.recipient_igids = recipientPks.map(userPk => positiveId(userPk, 'userId'));
    return this.#nativeResult(await this.#sendText(variables, signal));
  }

  async sendToGroup(threadId, content, { clientContext, signal } = {}) {
    const nativeThreadId = positiveId(threadId, 'threadId');
    const offlineId = this.#sendContext(clientContext);
    text(content, 'message', { max: 10000 });
    const { fbid: threadFbid, context: webContext } = await this.#thread(nativeThreadId, signal);
    webContext.checkSession();
    const variables = textMessageData(threadFbid, content, offlineId);
    const sent = await this.#sendText(variables, signal, webContext.checkSession);
    return this.#nativeResult(sent, nativeThreadId);
  }

  async markSeen(threadId, itemId, { signal } = {}) {
    const nativeThreadId = positiveId(threadId, 'threadId');
    const messageId = webMessageId(itemId);
    const payload = checked(await this.#http.graphql('27399783383056109', {
      data: { item_id: '', message_id: messageId },
      metadata: { ig_thread_igid: nativeThreadId },
    }, { friendlyName: 'useIGDMarkThreadAsReadMutation', signal }));
    const result = payload.data?.xig_direct_item_seen_mutation_with_slide_messaging_response;
    try {
      positiveId(result?.participant_fbid, 'read participant FBID');
      id(result?.watermark_timestamp_ms, 'read watermark');
    }
    catch { throw unconfirmed(); }
    return { status: 'ok', ...payload.data };
  }

  async deleteItem(threadId, itemId, { signal } = {}) {
    const native = positiveId(threadId, 'threadId');
    const messageId = webMessageId(itemId);
    const payload = await this.#unsend(native, messageId, signal);
    return { status: 'ok', ...payload.data };
  }

  async send(threadId, content, { replyToMessageId, replyToUserId, signal } = {}) {
    const offlineId = threadingId();
    const variables = textMessageData(threadId, content, offlineId, { replyToMessageId, replyToUserId });
    return this.#sendText(variables, signal);
  }

  async edit(threadId, messageId, content, { signal } = {}) {
    const variables = {
      body: { sensitive_string_value: text(content, 'message', { max: 10000 }) },
      offline_threading_id: threadingId(),
      target_item_id: null,
      target_message_id: webMessageId(messageId),
      thread_id: id(threadId, 'threadId'),
    };
    const payload = checked(await this.#http.graphql('32480262318254796', variables, {
      friendlyName: 'IGDirectEditMessageMutation',
      signal,
    }));
    if (!validMessageId(payload.data?.direct_edit_message_with_slide_messaging_response?.message_id)) throw unconfirmed();
    return payload;
  }

  async unsend(threadId, messageId, { signal } = {}) {
    const threadFbid = positiveId(threadId, 'threadId');
    const webMid = webMessageId(messageId);
    const { native, context } = await findInboxThread(
      this.#http,
      this.#getInboxContext,
      thread => String(thread.thread_fbid ?? thread.id) === threadFbid,
      { signal },
    );
    context.checkSession();
    return this.#unsend(native, webMid, signal, context.checkSession);
  }

  async #unsend(native, messageId, signal, guard) {
    const variables = {
      message_id: id(messageId, 'messageId', { numeric: false }),
      send_data: { thread_id: native },
    };
    const payload = checked(await this.#http.graphql('26948700068153789', variables, {
      friendlyName: 'IGDMessageUnsendDialogOffMsysMutation', guard,
      signal,
    }));
    if (payload.data?.direct_unsend_message !== true) throw unconfirmed();
    return payload;
  }

  async react(threadId, messageId, emoji, { remove = false, signal } = {}) {
    boolean(remove, 'remove');
    const variables = {
      input: {
        emoji: remove ? '' : text(emoji, 'emoji'),
        item_id: '',
        message_id: webMessageId(messageId),
        reaction_status: remove ? 'deleted' : 'created',
        thread_id: id(threadId, 'threadId'),
      },
    };
    const payload = checked(await this.#http.graphql('24374451552236906', variables, {
      friendlyName: 'IGDirectReactionSendMutation',
      signal,
    }));
    const result = payload.data?.xig_direct_reaction_send_with_slide_messaging_response;
    if (!result || typeof result.id !== 'string' || !result.id) throw unconfirmed();
    return payload;
  }

  async upload(data, { mimeType = 'image/jpeg', voice = false, signal } = {}) {
    validateAttachment(data, mimeType, voice);
    if (mimeType.startsWith('image/')) validateWebPhoto(data, mimeType);
    const context = await this.#context(signal);
    const uploaded = await uploadWebAttachment(this.#http, data, { context, mimeType, voice, signal });
    context.checkSession();
    return { uploadId: uploaded.attachmentId, mediaType: mimeType.startsWith('image/') ? 1 : 2 };
  }

  async sendAttachment(threadId, options = {}) {
    const threadFbid = positiveId(threadId, 'threadId');
    const attachmentIds = Array.isArray(options.attachmentId) ? options.attachmentId : [options.attachmentId];
    if (!attachmentIds.length) throw new ValidationError('At least one attachment ID is required.');
    if (attachmentIds.length !== 1) throw unsupported('A web media send accepts exactly one Mercury attachment.');
    const attachmentId = positiveId(attachmentIds[0], 'attachmentId');
    if (!['image', 'video', 'audio', 'file', 'gif'].includes(options.type ?? 'image')) throw new ValidationError('Unsupported attachment type.');
    if (text(options.content ?? '', 'content', { empty: true })) throw unsupported('Inline media captions are unavailable; send text separately.');
    const offlineId = this.#sendContext(options.clientContext);
    const payload = checked(await this.#http.graphql('25766288509716264', {
      attachment_fbid: attachmentId,
      reply_to_message_id: options.replyToMessageId === undefined ? null : webMessageId(options.replyToMessageId),
      forwarded_from_thread_id: null,
      is_forwarded_from_own_message: null,
      offline_threading_id: offlineId,
      thread_id: threadFbid,
    }, {
      friendlyName: 'IGDirectMediaSendMutation',
      signal: options.signal,
      guard: options.guard,
    }));
    const messageId = payload.data?.xig_direct_media_send_with_slide_messaging_response?.message_id;
    if (!validMessageId(messageId)) throw new DeliveryUnknownError();
    return { messageId, offlineThreadingId: offlineId };
  }

  #sendContext(value) { return value === undefined ? threadingId() : positiveId(value, 'clientContext'); }

  async #context(signal) {
    if (typeof this.#getInboxContext !== 'function') throw new ValidationError('Web messaging context is required. Use InstagramClient.');
    const context = await this.#getInboxContext({ signal });
    context.checkSession();
    return context;
  }

  #thread(threadId, signal) {
    return findInboxThread(this.#http, this.#getInboxContext, thread => String(thread.thread_id) === threadId, { signal });
  }

  async #sendText(variables, signal, guard) {
    const payload = checked(await this.#http.graphql('26911679871773184', variables, {
      friendlyName: 'IGDirectTextSendMutation',
      signal,
      guard,
    }));
    const messageId = payload.data?.xig_direct_text_send_with_slide_messaging_response?.message_id;
    if (!validMessageId(messageId)) throw unconfirmed();
    return { messageId, offlineThreadingId: variables.offline_threading_id };
  }

  #nativeResult(sent, threadId) {
    return {
      status: 'ok',
      payload: { message_id: sent.messageId, ...(threadId ? { thread_id: threadId } : {}) },
      ...sent,
    };
  }
}

function validMessageId(value) { return typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\s\u0000-\u001f\u007f]/.test(value); }
function unconfirmed() { return new InstagramError('Instagram did not confirm the operation.', { code: 'UNCONFIRMED_OPERATION' }); }
function unsupported(message) { return new InstagramError(message, { code: 'UNSUPPORTED_OPERATION' }); }
