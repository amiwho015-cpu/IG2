import { AuthenticationError, DeliveryUnknownError, InstagramError, TimeoutError } from '../shared/errors.js';
import { CommandError } from './command-input.js';
import { formatResult } from './result-format.js';

const sdkFailureCodes = new Set([
  'INSTAGRAM_ERROR', 'HTTP_ERROR', 'API_ERROR', 'PROVIDER_ERROR', 'INVALID_RESPONSE',
  'RESPONSE_TOO_LARGE', 'UNCONFIRMED_OPERATION', 'UNSUPPORTED_OPERATION', 'VALIDATION_ERROR', 'MEDIA_READ',
  'NOT_FOUND', 'THREAD_NOT_FOUND', 'AUTHENTICATION_REQUIRED', 'LOGIN_FAILED',
  'TWO_FACTOR_REQUIRED', 'TWO_FACTOR_METADATA', 'PASSWORD_ENCRYPTION_UNAVAILABLE',
  'TIMEOUT', 'RATE_LIMITED', 'DELIVERY_UNKNOWN', 'CONNECTION_ERROR', 'CLOSED',
  'SESSION_CHANGED', 'MESSAGE_REJECTED', 'NOT_CONNECTED', 'RECONNECTING', 'STOPPING', 'STOPPED',
]);

function failureCode(error) {
  if (error instanceof CommandError) return 'INVALID_COMMAND';
  if (error instanceof DeliveryUnknownError) return 'DELIVERY_UNKNOWN';
  const code = typeof error?.code === 'string' ? error.code.toUpperCase() : '';
  if (error instanceof InstagramError && sdkFailureCodes.has(code)) return code;
  if (error instanceof AuthenticationError) return 'AUTHENTICATION_REQUIRED';
  if (error instanceof TimeoutError) return 'TIMEOUT';
  return 'COMMAND_FAILED';
}

function failureText(error, code, status) {
  if (error instanceof CommandError) return error.message;
  if (code === 'DELIVERY_UNKNOWN') return 'Chưa xác định được tin nhắn đã gửi hay chưa. Bot sẽ không tự gửi lại.';
  return `Không thực hiện được lệnh (${code}${status ? `; HTTP ${status}` : ''}). Kiểm tra log ở máy chạy bot.`;
}

export async function dispatchCommand({ bot, client, commands, admins, replies, log }, message, name, argument) {
  const command = commands.get(name);
  if (!command) return;
  if (command.admin && !admins.has(message.senderId)) {
    await replies.send(message, 'Lệnh này chỉ dành cho quản trị viên bot.');
    return;
  }
  const context = {
    bot, client, message, argument,
    reply: text => replies.send(message, text),
    replyResult: value => replies.send(message, formatResult(value)),
  };
  try {
    await command.run(context);
    log('command', { name });
  } catch (error) {
    const code = failureCode(error);
    const status = error instanceof InstagramError && Number.isInteger(error.status) && error.status >= 100 && error.status <= 599 ? error.status : undefined;
    log('commandFailed', { name, code, ...(status === undefined ? {} : { status }) });
    try { await context.reply(failureText(error, code, status)); }
    catch { log('replyFailed', { name }); }
  }
}
