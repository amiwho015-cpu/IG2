import { InstagramError, ValidationError } from '../../shared/errors.js';
import { positiveId } from '../../shared/validation.js';
import { checked } from '../shared/response.js';

export function recipientIds(value, name, { array = false } = {}) {
  if (array && !Array.isArray(value)) {
    throw new ValidationError(`${name} must be an array of Instagram user PKs.`);
  }
  const values = Array.isArray(value) ? value : [value];
  if (!values.length || values.length > 100) throw new ValidationError(`${name} must contain 1–100 IDs.`);
  return [...new Set(values.map(entry => positiveId(entry, name)))];
}

export function threadFromLookup(payload) {
  checked(payload);
  const candidates = [];
  if (payload.thread?.thread_id !== undefined) candidates.push(payload.thread.thread_id);
  if (payload.thread_id !== undefined) candidates.push(payload.thread_id);
  if (payload.threads !== undefined) {
    if (!Array.isArray(payload.threads)) throw new InstagramError('Thread lookup returned invalid threads.', { code: 'INVALID_RESPONSE' });
    for (const thread of payload.threads) {
      if (!thread || thread.thread_id === undefined) throw new InstagramError('Thread lookup returned an invalid thread.', { code: 'INVALID_RESPONSE' });
      candidates.push(thread.thread_id);
    }
  }
  const unique = [...new Set(candidates.map(value => positiveId(value, 'threadId')))];
  if (unique.length !== 1) {
    throw new InstagramError('Thread lookup did not return one unambiguous thread.', { code: 'THREAD_NOT_FOUND' });
  }
  return unique[0];
}

export function messagingThreadFromInbox(payload, nativeThreadId) {
  const native = positiveId(nativeThreadId, 'nativeThreadId');
  checked(payload);
  const edges = payload.data?.get_slide_mailbox_for_iris_subscription?.threads_by_folder?.edges;
  if (!Array.isArray(edges)) throw new InstagramError('Instagram did not return inbox threads.', { code: 'INVALID_RESPONSE' });
  const matches = new Set();
  for (const edge of edges) {
    const thread = edge?.node?.as_ig_direct_thread;
    if (!thread || String(thread.thread_id) !== native) continue;
    positiveId(thread.thread_id, 'nativeThreadId');
    matches.add(positiveId(thread.thread_fbid ?? thread.id, 'threadFbid'));
  }
  if (matches.size !== 1) throw new InstagramError('Inbox did not return one unambiguous conversation.', { code: 'THREAD_NOT_FOUND' });
  return [...matches][0];
}

export async function findInboxThread(http, getInboxContext, matches, { signal, refresh = false, folder = 'INBOX', otherFolders = true } = {}) {
  if (typeof getInboxContext !== 'function') throw new ValidationError('Web inbox context is required. Use InstagramClient.');
  const context = await getInboxContext({ signal, refresh });
  context.checkSession();
  checked(context.result);
  const mailbox = context.result.data?.get_slide_mailbox_for_iris_subscription;
  let connection = mailbox?.threads_by_folder;
  if (folder !== 'INBOX') connection = await readInboxPage(http, mailbox, '', folder, signal, context.checkSession);
  const cursors = new Set();
  for (let page = 0; page < 3; page++) {
    if (!Array.isArray(connection?.edges)) throw new InstagramError('Instagram did not return inbox threads.', { code: 'INVALID_RESPONSE' });
    const found = new Map();
    for (const edge of connection.edges) {
      const thread = edge?.node?.as_ig_direct_thread;
      if (!thread || !matches(thread)) continue;
      const native = positiveId(thread.thread_id, 'nativeThreadId');
      const fbid = positiveId(thread.thread_fbid ?? thread.id, 'threadFbid');
      found.set(native + ':' + fbid, { thread, native, fbid, context });
    }
    if (found.size === 1) return [...found.values()][0];
    if (found.size > 1) throw new InstagramError('Inbox returned ambiguous conversation identities.', { code: 'THREAD_NOT_FOUND' });
    if (page === 0 && !refresh) return findInboxThread(http, getInboxContext, matches, { signal, refresh: true, folder, otherFolders });
    if (!connection.page_info?.has_next_page || page === 2) break;
    const cursor = connection.page_info.end_cursor;
    if (typeof cursor !== 'string' || !cursor || cursors.has(cursor)) throw new InstagramError('Inbox returned invalid pagination.', { code: 'INVALID_RESPONSE' });
    cursors.add(cursor);
    connection = await readInboxPage(http, mailbox, cursor, folder, signal, context.checkSession);
  }
  if (otherFolders && folder === 'INBOX') {
    for (const extra of ['PENDING']) {
      try { return await findInboxThread(http, async () => context, matches, { signal, refresh: true, folder: extra, otherFolders: false }); }
      catch (error) { if (error.code !== 'THREAD_NOT_FOUND') throw error; }
    }
  }
  throw new InstagramError('Inbox did not return one unambiguous conversation within three pages.', { code: 'THREAD_NOT_FOUND' });
}

async function readInboxPage(http, mailbox, cursor, folder, signal, guard) {
  guard();
  const payload = checked(await http.graphql('28774058922187457', {
    count: 15, cursor, folder, id: positiveId(mailbox?.id, 'mailboxId'), newer_than_timestamp_ms: null,
    __relay_internal__pv__IGDPinnedThreadsRenderEnabledGKrelayprovider: true,
    __relay_internal__pv__IGDMaxUnreadMessagesCountrelayprovider: 5,
    __relay_internal__pv__IGDThreadListActionsEnabledGKrelayprovider: true,
  }, { friendlyName: 'IGDThreadListOffMsysPaginationQuery', signal, guard }));
  guard();
  return payload.data?.fetch__SlideMailbox?.threads_by_folder;
}
