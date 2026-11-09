import { parseToggle } from '../command-input.js';
import { remember } from '../bounded-map.js';

export function preferenceCommands({ history, conversations }) {
  return [
    { name: 'antiunsend', usage: 'antiunsend <on | off>', admin: true, run: async context => {
      const enabled = parseToggle(context.argument, 'antiunsend');
      history.setEnabled(context.message.threadKey, enabled);
      await context.reply(enabled ? 'Đã bật bộ nhớ thu hồi cho cuộc trò chuyện này (chỉ trong RAM).' : 'Đã tắt bộ nhớ thu hồi cho cuộc trò chuyện này.');
    } },
    { name: 'autodl', usage: 'autodl <on | off>', admin: true, run: async context => {
      const enabled = parseToggle(context.argument, 'autodl');
      remember(conversations.autoDownload, context.message.threadKey, enabled, 128);
      await context.reply(`Tự bóc link: ${enabled ? 'on' : 'off'}.`);
    } },
  ];
}
