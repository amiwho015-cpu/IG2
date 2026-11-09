import { required, resolveMessagingThread, splitArgument } from '../command-input.js';

export function messageCommands() {
  return [
    { name: 'react', usage: 'react <message ID> <emoji>', admin: true, run: async context => {
      const [messageId, emoji] = splitArgument(context.argument);
      required(messageId, '/react <message ID> <emoji>');
      required(emoji, '/react <message ID> <emoji>');
      await context.replyResult(await context.client.messages.react(await resolveMessagingThread(context), messageId, emoji));
    } },
    { name: 'edit', usage: 'edit <message ID> <nội dung>', admin: true, run: async context => {
      const [messageId, content] = splitArgument(context.argument);
      required(messageId, '/edit <message ID> <nội dung>');
      required(content, '/edit <message ID> <nội dung>');
      await context.replyResult(await context.client.messages.edit(await resolveMessagingThread(context), messageId, content));
    } },
    { name: 'unsend', usage: 'unsend <message ID>', admin: true, run: async context => {
      const messageId = required(context.argument, '/unsend <message ID>');
      await context.replyResult(await context.client.messages.unsend(await resolveMessagingThread(context), messageId));
    } },
    ...['media', 'dl'].map(name => ({ name, usage: `${name} <URL hoặc media ID>`, run: async context => {
      await context.replyResult(await context.client.media.info(required(context.argument, `/${name} <URL hoặc media ID>`)));
    } })),
  ];
}
