import { DeliveryUnknownError, InstagramError, ValidationError } from '../../shared/errors.js';
import { boolean, id, positiveId, text } from '../../shared/validation.js';
import { parseCookies } from '../../shared/cookies.js';
import { parseSlideMessage } from '../../shared/message-parser.js';
import { checked, graphqlResult } from '../shared/response.js';
import { threadingId } from '../messages/message-payloads.js';
import { findInboxThread, recipientIds } from './thread-identifiers.js';

const paginationFlags = {
  __relay_internal__pv__IGDPinnedThreadsRenderEnabledGKrelayprovider: true,
  __relay_internal__pv__IGDMaxUnreadMessagesCountrelayprovider: 5,
  __relay_internal__pv__IGDThreadListActionsEnabledGKrelayprovider: true,
};

function nativeThread(thread) {
  const nativeThreadId = positiveId(thread.thread_id, 'nativeThreadId');
  return { ...thread, thread_id: nativeThreadId, thread_v2_id: String(thread.thread_key ?? '') };
}

function connectionThreads(connection) {
  if (!Array.isArray(connection?.edges)) throw invalid();
  return connection.edges.map(edge => edge?.node?.as_ig_direct_thread).filter(Boolean);
}

function normalize(connection) {
  const threads = connectionThreads(connection).map(thread => ({
    id: positiveId(thread.thread_fbid ?? thread.id, 'threadFbid'),
    nativeThreadId: positiveId(thread.thread_id, 'nativeThreadId'),
    shortId: String(thread.thread_key ?? ''),
    name: thread.thread_title ?? '',
    isGroup: Boolean(thread.is_group),
    folder: thread.folder,
  }));
  return { threads, countThread: threads.length, pageInfo: connection.page_info ?? null };
}

export class ThreadsApi {
  #http;
  #getBootstrap;
  #getInboxContext;
  #users;

  constructor(http, _rest, { getBootstrap, getInboxContext, users } = {}) {
    this.#http = http;
    this.#getBootstrap = getBootstrap;
    this.#getInboxContext = getInboxContext;
    this.#users = users;
  }

  async #context(signal, refresh = false) {
    if (typeof this.#getInboxContext !== 'function') throw new ValidationError('Web inbox context is required. Use InstagramClient.');
    const context = await this.#getInboxContext({ signal, refresh });
    context.checkSession();
    return context;
  }

  async #thread(threadId, signal, refresh = false, folder = 'INBOX') {
    const nativeThreadId = positiveId(threadId, 'nativeThreadId');
    return findInboxThread(
      this.#http,
      this.#getInboxContext,
      thread => String(thread.thread_id) === nativeThreadId,
      { signal, refresh, folder },
    );
  }

  async #page(cursor, folder, signal) {
    const context = await this.#context(signal, true);
    checked(context.result);
    const mailbox = context.result.data?.get_slide_mailbox_for_iris_subscription;
    if (!mailbox || !Array.isArray(mailbox.threads_by_folder?.edges)) throw invalid();
    if (cursor === null && folder === 'INBOX') return mailbox.threads_by_folder;
    const payload = checked(await this.#http.graphql('28774058922187457', {
      count: 15,
      cursor: cursor ?? '',
      folder,
      id: positiveId(mailbox.id, 'mailboxId'),
      newer_than_timestamp_ms: null,
      ...paginationFlags,
    }, { friendlyName: 'IGDThreadListOffMsysPaginationQuery', signal }));
    const connection = payload.data?.fetch__SlideMailbox?.threads_by_folder;
    connectionThreads(connection);
    return connection;
  }

  async get(threadId, { signal } = {}) {
    const { thread, native: nativeThreadId } = await this.#thread(threadId, signal, true);
    const threadKey = positiveId(thread.thread_key, 'threadKey');
    const payload = checked(await this.#http.graphql('29432273173041378', {
      min_uq_seq_id: null,
      thread_fbid: threadKey,
      __relay_internal__pv__IGDEnableOffMsysChatThemesQErelayprovider: false,
      __relay_internal__pv__IGDInitialMessagePageCountrelayprovider: 20,
    }, { friendlyName: 'IGDThreadDetailQuery', signal }));
    const result = payload.data?.get_slide_thread_nullable?.as_ig_direct_thread;
    if (!result || String(result.thread_id) !== nativeThreadId) {
      throw new InstagramError('Instagram did not return the requested conversation.', { code: 'THREAD_NOT_FOUND' });
    }
    return { status: 'ok', thread: nativeThread(result) };
  }

  async getByParticipants(userPks, { signal } = {}) {
    const recipientPks = new Set(recipientIds(userPks, 'userPks', { array: true }));
    const viewerPk = parseCookies(this.#http.cookies ?? '').get('ds_user_id');
    const selfOnly = viewerPk && recipientPks.size === 1 && recipientPks.has(viewerPk);
    if (viewerPk) recipientPks.delete(viewerPk);
    const { thread } = await findInboxThread(this.#http, this.#getInboxContext, thread => {
      if (!Array.isArray(thread.users)) return false;
      const participantPks = new Set(thread.users.map(user => String(user.pk ?? user.pk_id ?? user.id)));
      const containsViewer = viewerPk && participantPks.has(viewerPk);
      if (viewerPk) participantPks.delete(viewerPk);
      if (selfOnly) return Boolean(containsViewer) && !thread.is_group && participantPks.size === 0;
      if (recipientPks.size === 1 && thread.is_group) return false;
      return recipientPks.size > 0 && participantPks.size === recipientPks.size && [...recipientPks].every(pk => participantPks.has(pk));
    }, { signal, refresh: true });
    return { status: 'ok', thread: nativeThread(thread) };
  }

  async history(threadId, { cursor = null, limit = 20, signal } = {}) {
    const nativeThreadId = positiveId(threadId, 'nativeThreadId');
    if (cursor !== null) text(cursor, 'cursor', { max: 2048 });
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ValidationError('limit must be an integer from 1 to 100.');
    const { thread, fbid: threadFbid, context } = await this.#thread(nativeThreadId, signal);
    let docId;
    let friendlyName;
    let variables;
    if (cursor === null) {
      docId = '29432273173041378';
      friendlyName = 'IGDThreadDetailQuery';
      variables = {
        min_uq_seq_id: null,
        thread_fbid: positiveId(thread.thread_key, 'threadKey'),
        __relay_internal__pv__IGDEnableOffMsysChatThemesQErelayprovider: false,
        __relay_internal__pv__IGDInitialMessagePageCountrelayprovider: limit,
      };
    } else {
      docId = '29380270148264352';
      friendlyName = 'IGDMessageListOffMsysQuery';
      variables = {
        after: cursor,
        before: null,
        first: limit,
        last: null,
        id: threadFbid,
        newer_than_message_id: null,
        older_than_message_id: null,
        __relay_internal__pv__IGDInitialMessagePageCountrelayprovider: limit,
      };
    }
    const payload = checked(await this.#http.graphql(docId, variables, {
      friendlyName,
      signal,
      guard: context.checkSession,
    }));
    context.checkSession();
    const result = (cursor === null ? payload.data?.get_slide_thread_nullable : payload.data?.fetch__SlideThread)?.as_ig_direct_thread;
    if (!result || (result.thread_id !== undefined && String(result.thread_id) !== nativeThreadId) ||
        (result.thread_fbid !== undefined && String(result.thread_fbid) !== threadFbid) ||
        (result.id !== undefined && String(result.id) !== threadFbid)) {
      throw new InstagramError('Instagram did not return the requested conversation.', { code: 'THREAD_NOT_FOUND' });
    }
    const connection = result.slide_messages;
    if (!Array.isArray(connection?.edges) || !connection.page_info || typeof connection.page_info.has_next_page !== 'boolean') throw invalid();
    const hasNextPage = connection.page_info.has_next_page;
    const endCursor = hasNextPage ? text(connection.page_info.end_cursor, 'history cursor', { max: 2048 }) : null;
    if (hasNextPage && endCursor === cursor) throw invalid();
    const viewerId = parseCookies(this.#http.cookies ?? '').get('ds_user_id') ?? '';
    const messages = connection.edges.map(edge => parseSlideMessage(edge?.node, {
      nativeThreadId, threadFbid, viewerId, isGroup: thread.is_group,
    })).filter(Boolean);
    return { messages, pageInfo: { hasNextPage, endCursor } };
  }

  async list(cursor = null, { signal } = {}) {
    if (cursor !== null) text(cursor, 'cursor', { max: 2048 });
    const connection = await this.#page(cursor, 'INBOX', signal);
    return {
      status: 'ok',
      inbox: {
        threads: connectionThreads(connection).map(nativeThread),
        oldest_cursor: connection.page_info?.end_cursor,
        has_older: Boolean(connection.page_info?.has_next_page),
      },
    };
  }

  async inbox({ folder = 'INBOX', signal } = {}) {
    if (!['INBOX', 'PENDING', 'ARCHIVED'].includes(folder)) throw new ValidationError('Unsupported inbox folder.');
    return normalize(await this.#page(null, folder, signal));
  }

  async requests({ cursor = '', signal } = {}) {
    text(cursor, 'cursor', { empty: true, max: 2048 });
    return normalize(await this.#page(cursor, 'PENDING', signal));
  }

  async getSyncSequence({ signal } = {}) {
    if (!this.#getBootstrap) throw new ValidationError('Realtime bootstrap is not configured. Use InstagramClient.');
    return id((await this.#getBootstrap({ signal })).sequenceId, 'syncSequence');
  }

  async #mutation(docId, friendlyName, variables, field, signal, guard) {
    guard?.();
    const payload = graphqlResult(await this.#http.graphql(docId, variables, { friendlyName, signal, guard }));
    const result = payload.data?.[field];
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw unconfirmed();
    try { positiveId(result.id, 'confirmed threadFbid'); }
    catch { throw unconfirmed(); }
    if (variables.thread_fbid !== undefined && String(result.id) !== variables.thread_fbid) throw unconfirmed();
    return payload;
  }

  async accept(threadId, { signal, guard } = {}) {
    return this.#mutation('36571001125823973', 'useIGDirectAcceptMessageRequestMutation', {
      thread_fbid: positiveId(threadId, 'threadFbid'),
      ig_inbox_folder: null,
      offline_threading_id: threadingId(),
    }, 'ig_direct_accept_message_request', signal, guard);
  }

  async approve(threadId, { signal } = {}) {
    const { fbid, context } = await this.#thread(threadId, signal, false, 'PENDING');
    const payload = await this.accept(fbid, { signal, guard: context.checkSession });
    return { status: 'ok', ...payload.data };
  }

  async #mute(threadId, seconds, signal) {
    const { fbid, context } = await this.#thread(threadId, signal);
    const payload = await this.#mutation('26360506043651125', 'IGDInboxInfoMuteToggleOffMsysMutation', {
      thread_fbid: fbid,
      mute_seconds: seconds,
      offline_threading_id: threadingId(),
    }, 'xig_direct_mute_thread_with_fbid', signal, context.checkSession);
    if (payload.data.xig_direct_mute_thread_with_fbid.ig_direct_mute_thread !== (seconds !== 0)) throw unconfirmed();
    return { status: 'ok', ...payload.data };
  }
  mute(threadId, { signal } = {}) {
    return this.#mute(threadId, -1, signal);
  }

  unmute(threadId, { signal } = {}) {
    return this.#mute(threadId, 0, signal);
  }

  async rename(threadId, name, { signal, guard } = {}) {
    const threadFbid = positiveId(threadId, 'threadFbid');
    const title = text(name, 'name', { max: 100 }).trim();
    const payload = checked(await this.#http.graphql('26508340268868683', {
      new_title: title,
      thread_fbid: threadFbid,
    }, { friendlyName: 'IGDEditThreadNameDialogOffMsysMutation', signal, guard }));
    try {
      const verified = await findInboxThread(
        this.#http,
        this.#getInboxContext,
        thread => String(thread.thread_fbid ?? thread.id) === threadFbid,
        { signal, refresh: true },
      );
      if (verified.thread.thread_title !== title) throw unconfirmed();
    } catch (error) {
      throw new DeliveryUnknownError('The conversation title was not confirmed. Check the inbox before changing it again.', { cause: error });
    }
    return { ...payload, verified: true };
  }

  async updateTitle(threadId, title, { signal } = {}) {
    text(title, 'title', { max: 100 });
    const { fbid, context } = await this.#thread(threadId, signal);
    const payload = await this.rename(fbid, title, { signal, guard: context.checkSession });
    return { status: 'ok', ...payload.data };
  }

  async addMembers(threadId, userPks, { signal } = {}) {
    const recipientPks = recipientIds(userPks, 'userPks', { array: true });
    const { fbid, context } = await this.#thread(threadId, signal);
    const payload = await this.#mutation('27335198219492328', 'IGDAddParticipantSubmitBarMutation', {
      thread_fbid: fbid,
      user_igids: recipientPks,
      ...paginationFlags,
    }, 'xig_ig_direct_add_users', signal, context.checkSession);
    return { status: 'ok', ...payload.data };
  }

  async leave(threadId, { signal } = {}) {
    const { fbid, context } = await this.#thread(threadId, signal);
    const payload = await this.#mutation('27243106098639056', 'useIGDLeaveChatMutation', {
      thread_fbid: fbid,
    }, 'xig_ig_direct_leave_thread', signal, context.checkSession);
    return { status: 'ok', ...payload.data };
  }

  async admin(threadId, userId, enabled = true, { signal } = {}) {
    boolean(enabled, 'enabled');
    const docId = enabled ? '35563011113312213' : '26688907887428172';
    const friendlyName = enabled ? 'IGDAddAdminDialogItemOffMsysMutation' : 'IGDRemoveAdminDialogItemOffMsysMutation';
    const variables = {
      thread_fbid: positiveId(threadId, 'threadFbid'),
      user_igids: [positiveId(userId, 'userPk')],
    };
    const responseField = enabled ? 'xig_direct_add_admins' : 'xig_direct_remove_admins';
    return this.#mutation(docId, friendlyName, variables, responseField, signal);
  }

  async createGroup(userPks, title, { signal } = {}) {
    const participantPks = recipientIds(userPks, 'userPks', { array: true });
    const groupTitle = text(title, 'title', { max: 100 }).trim();
    const viewerPk = parseCookies(this.#http.cookies ?? '').get('ds_user_id');
    const recipientPks = participantPks.filter(pk => pk !== viewerPk);
    if (recipientPks.length < 2) throw new ValidationError('A group requires at least two other participants.');
    if (typeof this.#users?.info !== 'function') throw new ValidationError('User lookup is required. Use InstagramClient.');
    const webContext = await this.#context(signal);
    const messagingFbids = [];
    for (const recipientPk of recipientPks) {
      signal?.throwIfAborted();
      const profile = await this.#users.info(recipientPk, { signal });
      messagingFbids.push(positiveId((profile.user ?? profile).interop_messaging_user_fbid, 'recipient messaging FBID'));
    }
    const uniqueMessagingFbids = [...new Set(messagingFbids)];
    if (uniqueMessagingFbids.length !== recipientPks.length) throw new ValidationError('Group recipients must identify distinct accounts.');
    webContext.checkSession();
    const payload = checked(await this.#http.graphql('27529949946640544', {
      recipient_eimu_fbids: uniqueMessagingFbids,
      offline_threading_id: threadingId(),
      entry_point: null,
    }, {
      friendlyName: 'useCreateOpenGroupThreadOffMsysMutation',
      signal,
      guard: webContext.checkSession,
    }));
    const created = payload.data?.xig_ig_direct_create_thread;
    let threadFbid;
    try { threadFbid = positiveId(created?.id, 'created threadFbid'); }
    catch (error) { throw new DeliveryUnknownError(undefined, { cause: error }); }
    try {
      webContext.checkSession();
      await this.rename(threadFbid, groupTitle, { signal, guard: webContext.checkSession });
    } catch (error) {
      throw new DeliveryUnknownError('Group was created but its title was not confirmed. Check the inbox before creating it again.', { cause: error });
    }
    return {
      status: 'ok',
      thread_fbid: threadFbid,
      thread_title: groupTitle,
      ...(created.as_ig_direct_thread?.thread_id
        ? { thread: nativeThread({ ...created.as_ig_direct_thread, thread_title: groupTitle }) }
        : {}),
    };
  }
  rankedRecipients() { return Promise.reject(unsupported('The legacy ranked-recipient route is unavailable. Use users.searchContacts().')); }
  presence() { return Promise.reject(unsupported('The legacy presence route is unavailable.')); }
  decline() { return Promise.reject(unsupported('The legacy decline route is unavailable.')); }
  async #legacy(path, fields, signal) {
    const context = await this.#context(signal);
    context.checkSession();
    const response = checked(await this.#http.post(path, {
      ...context.form,
      ...fields,
    }, { signal, headers: context.headers }));
    try { context.checkSession(); }
    catch (error) { throw new DeliveryUnknownError(undefined, { cause: error }); }
    if (response.status !== 'ok' && response.payload?.success !== true) throw unconfirmed();
    return response;
  }
  nickname(threadId, userId, nickname, { signal } = {}) {
    return this.#legacy('/api/v1/direct_v2/threads/save_thread_nickname/?source=thread_settings&dpr=1', {
      nickname: text(nickname, 'nickname', { empty: true }),
      participant_id: positiveId(userId, 'userId'),
      thread_or_other_fbid: positiveId(threadId, 'threadFbid'),
    }, signal);
  }
  emoji(threadId, emoji, { signal } = {}) {
    return this.#legacy('/api/v1/direct_v2/threads/save_thread_emoji/?source=thread_settings', {
      emoji_choice: text(emoji, 'emoji'),
      thread_or_other_fbid: positiveId(threadId, 'threadFbid'),
    }, signal);
  }
  theme() { return Promise.reject(unsupported('The legacy theme document is not a valid theme-setting mutation.')); }
  themes() { return Promise.reject(unsupported('The theme list document is not available.')); }
}

function invalid() { return new InstagramError('Instagram did not return an inbox connection.', { code: 'INVALID_RESPONSE' }); }
function unconfirmed() { return new InstagramError('Instagram did not confirm the operation.', { code: 'UNCONFIRMED_OPERATION' }); }
function unsupported(message) { return new InstagramError(message, { code: 'UNSUPPORTED_OPERATION' }); }
