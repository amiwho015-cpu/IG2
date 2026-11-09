import { MessageHandlers } from '../receiving/message-handlers.js';
import { InstagramError, ValidationError } from '../shared/errors.js';

export function createMessageHandlers(client, getInboxContext, options) {
  if (options !== undefined && (!options || typeof options !== 'object' || Array.isArray(options))) {
    throw new ValidationError('receiving must be an options object.');
  }

  const resolveThread = async (message, { signal }) => {
    const context = await getInboxContext({ signal });
    const edges = context.result.data?.get_slide_mailbox_for_iris_subscription?.threads_by_folder?.edges;
    if (!Array.isArray(edges)) {
      throw new InstagramError('Inbox metadata is unavailable.', { code: 'INVALID_RESPONSE' });
    }

    const threads = edges.map(edge => edge?.node?.as_ig_direct_thread);
    const matches = threads.filter(thread => {
      if (!thread) return false;
      if (message.nativeThreadId != null) {
        return String(thread.thread_id) === String(message.nativeThreadId);
      }
      if (message.threadFbid != null) {
        return String(thread.thread_fbid ?? thread.id) === String(message.threadFbid);
      }
      return false;
    });

    if (matches.length === 1) {
      context.checkSession();
      return matches[0];
    }
    if (message.nativeThreadId != null) {
      const result = await client.threads.get(message.nativeThreadId, { signal });
      return result.thread;
    }
    throw new InstagramError('The receiving message has no unambiguous conversation mapping.', { code: 'THREAD_NOT_FOUND' });
  };

  return new MessageHandlers({
    ...options,
    client,
    resolveThread,
    onError: error => client.emit('handlerError', error),
  });
}
