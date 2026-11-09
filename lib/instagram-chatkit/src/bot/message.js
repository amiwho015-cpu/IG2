export function isMetaMessage(message) {
  return message.type === 'messageUnsend' || message.type === 'messageEdit';
}

export function messageKey(message) {
  return `${message.threadKey}:${message.id}`;
}

export function normalizeMessage(event) {
  if (!event || !['message', 'messageUnsend', 'messageEdit'].includes(event.type)) return null;
  const data = event.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const rawIds = [data.id ?? data.messageId ?? data.messageID, data.messageId, data.senderId ?? data.userID ?? data.senderID, data.threadId ?? data.threadID ?? data.replyToID, data.nativeThreadId, data.clientContext];
  if (rawIds.some(value => value != null && (
    !['string', 'number', 'bigint'].includes(typeof value) || (typeof value === 'number' && !Number.isSafeInteger(value)) || String(value).length > 512
  ))) return null;
  const string = value => value == null ? '' : String(value);
  const body = data.text ?? data.newText ?? data.body;
  if (typeof body === 'string' && body.length > 100_000) return null;
  const message = {
    type: event.type,
    id: string(data.id ?? data.messageId ?? data.messageID),
    ...(data.messageId != null && string(data.messageId) !== string(data.id ?? data.messageId ?? data.messageID) ? { messageId: string(data.messageId) } : {}),
    senderId: string(data.senderId ?? data.userID ?? data.senderID),
    threadId: string(data.threadId ?? data.threadID ?? data.replyToID ?? data.nativeThreadId),
    ...(data.nativeThreadId != null ? { nativeThreadId: string(data.nativeThreadId) } : {}),
    ...(data.clientContext != null ? { clientContext: string(data.clientContext) } : {}),
    text: typeof body === 'string' ? body : '',
    attachments: Array.isArray(data.attachments) ? data.attachments.slice(0, 10).filter(attachment => attachment && typeof attachment === 'object').map(attachment => ({
      type: string(attachment.type).slice(0, 64),
      url: string(attachment.url).slice(0, 4096),
      previewUrl: string(attachment.previewUrl).slice(0, 4096),
    })) : [],
    fromMe: data.fromMe === true || data.isFromMe === true,
  };
  if (message.threadId === '0') message.threadId = '';
  message.threadKey = message.threadId;
  return message.id && (message.threadKey || isMetaMessage(message)) ? message : null;
}
