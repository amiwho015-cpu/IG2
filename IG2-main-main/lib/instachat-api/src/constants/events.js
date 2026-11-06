'use strict';

/**
 * Standard client events emitted by InstaChatClient
 */
const Events = Object.freeze({
  READY: 'ready',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  MESSAGE: 'message',
  MESSAGE_UPDATE: 'message_update',
  MESSAGE_EDIT: 'message_edit',
  MESSAGE_UNSENT: 'message_unsent',
  REACTION: 'reaction',
  READ_RECEIPT: 'read_receipt',
  THREAD_UPDATE: 'thread_update',
  PARTICIPANTS_CHANGED: 'participants_changed',
  TYPING: 'typing',
  AUTH_ERROR: 'auth_error',
  RATE_LIMIT: 'rate_limit',
  RECOVERED: 'recovered',
  RECONNECTING: 'reconnecting',
  COMMAND: 'command',
  ERROR: 'error'
});

module.exports = Events;
