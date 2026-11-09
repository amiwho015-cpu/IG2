import { CommandError, required } from '../command-input.js';

export function profileCommands(searchLimiter) {
  return [
    { name: 'search', usage: 'search <từ khóa>', run: async ({ message, argument, client, replyResult }) => {
      const query = required(argument, '/search <từ khóa>');
      if (query.length < 2 || query.length > 100) throw new CommandError('Từ khóa cần dài từ 2 đến 100 ký tự.');
      searchLimiter.reserve(message.senderId);
      await replyResult(await client.users.searchContacts(query));
    } },
    { name: 'profile', usage: 'profile <username hoặc ID>', run: async context => {
      await context.replyResult(await context.client.users.profile(required(context.argument, '/profile <username hoặc ID>')));
    } },
    { name: 'info', usage: 'info [username hoặc ID]', run: async context => {
      await context.replyResult(await context.client.users.profile(context.argument.trim() || context.message.senderId));
    } },
    { name: 'story', usage: 'story <username hoặc user PK>', run: async context => {
      const target = required(context.argument, '/story <username hoặc user PK>');
      const user = /^[1-9]\d*$/.test(target) ? { pk: target } : await context.client.users.infoByUsername(target.replace(/^@/, ''));
      const userId = user.pk ?? user.id;
      await context.replyResult(await context.client.stories.getUser(userId));
    } },
    ...['follow', 'unfollow'].map(name => ({ name, usage: `${name} <user ID>`, admin: true, run: async context => {
      await context.replyResult(await context.client.users[name](required(context.argument, `/${name} <user ID>`)));
    } })),
    ...[['block', true], ['unblock', false]].map(([name, enabled]) => ({ name, usage: `${name} <user ID>`, admin: true, run: async context => {
      await context.replyResult(await context.client.users.block(required(context.argument, `/${name} <user ID>`), enabled));
    } })),
    { name: 'bio', usage: 'bio <nội dung>', admin: true, run: async context => {
      await context.replyResult(await context.client.users.bio(required(context.argument, '/bio <nội dung>')));
    } },
    { name: 'notif', usage: 'notif', admin: true, run: async context => {
      await context.replyResult(await context.client.users.notifications());
    } },
  ];
}
