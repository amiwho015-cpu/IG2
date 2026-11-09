import { parseIds, required, requireNativeThreadId, resolveMessagingThread, splitArgument } from '../command-input.js';

export function threadCommands() {
  return [
    { name: 'inbox', usage: 'inbox', admin: true, run: async context => context.replyResult(await context.client.threads.inbox()) },
    { name: 'requests', usage: 'requests', admin: true, run: async context => context.replyResult(await context.client.threads.requests()) },
    { name: 'accept', usage: 'accept <messaging thread FBID>', admin: true, run: async context => {
      await context.replyResult(await context.client.threads.accept(required(context.argument, '/accept <messaging thread FBID>')));
    } },
    { name: 'thread', usage: 'thread [native thread ID]', admin: true, run: async context => {
      await context.replyResult(await context.client.threads.get(context.argument.trim() || requireNativeThreadId(context.message)));
    } },
    { name: 'rename', usage: 'rename <tên nhóm>', admin: true, run: async context => {
      await context.replyResult(await context.client.threads.updateTitle(requireNativeThreadId(context.message), required(context.argument, '/rename <tên nhóm>')));
    } },
    ...['mute', 'unmute'].map(name => ({ name, usage: name, admin: true, run: async context => {
      await context.replyResult(await context.client.threads[name](requireNativeThreadId(context.message)));
    } })),
    { name: 'creategroup', usage: 'creategroup <user PK,PK,...> <tên nhóm>', admin: true, run: async context => {
      const [users, title] = splitArgument(context.argument);
      await context.replyResult(await context.client.threads.createGroup(parseIds(users, '/creategroup <user PK,PK,...> <tên nhóm>'), required(title, '/creategroup <user PK,PK,...> <tên nhóm>')));
    } },
    { name: 'add', usage: 'add <user PK,PK,...>', admin: true, run: async context => {
      await context.replyResult(await context.client.threads.addMembers(requireNativeThreadId(context.message), parseIds(context.argument, '/add <user PK,PK,...>')));
    } },
    ...[['promote', true], ['demote', false]].map(([name, enabled]) => ({ name, usage: `${name} <user PK>`, admin: true, run: async context => {
      const userPk = required(context.argument, `/${name} <user PK>`);
      await context.replyResult(await context.client.threads.admin(await resolveMessagingThread(context), userPk, enabled));
    } })),
    { name: 'leave', usage: 'leave', admin: true, run: async context => {
      await context.replyResult(await context.client.threads.leave(requireNativeThreadId(context.message)));
    } },
  ];
}
