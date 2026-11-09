import { required } from '../command-input.js';

export function systemCommands() {
  return [
    { name: 'hi', usage: 'hi', run: async context => context.reply('Xin chào! Dùng /help để xem lệnh.') },
    { name: 'ping', usage: 'ping', run: async context => context.reply('pong!') },
    { name: 'help', usage: 'help', run: async ({ bot, message, reply }) => {
      const commands = [...bot.commands.values()].filter(command => !command.admin || bot.isAdmin(message.senderId));
      await reply(commands.map(command => `${bot.prefix}${command.usage}${command.admin ? ' [admin]' : ''}`).join('\n'));
    } },
    { name: 'id', usage: 'id', run: async ({ message, reply }) => reply([
      `Sender: ${message.senderId}`,
      `Thread: ${message.threadId || '(không có)'}`,
      `Message: ${message.id}`,
      ...(message.messageId ? [`Message MID: ${message.messageId}`] : []),
    ].join('\n')) },
    { name: 'echo', usage: 'echo <nội dung>', run: async ({ argument, reply }) => reply(required(argument, '/echo <nội dung>')) },
  ];
}
