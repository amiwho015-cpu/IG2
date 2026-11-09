import { required, splitArgument } from '../command-input.js';

export function postCommands() {
  return [
    ...[['like', 'like', true], ['unlike', 'like', false], ['save', 'save', true], ['unsave', 'save', false]].map(([name, method, enabled]) => ({
      name, usage: `${name} <URL hoặc media ID>`, admin: true, run: async context => {
        await context.replyResult(await context.client.media[method](required(context.argument, `/${name} <URL hoặc media ID>`), enabled));
      },
    })),
    { name: 'comment', usage: 'comment <URL hoặc media ID> <nội dung>', admin: true, run: async context => {
      const [target, text] = splitArgument(context.argument);
      required(target, '/comment <URL hoặc media ID> <nội dung>');
      required(text, '/comment <URL hoặc media ID> <nội dung>');
      await context.replyResult(await context.client.media.comment(target, text));
    } },
  ];
}
