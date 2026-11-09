import { CommandError, required, splitArgument } from '../command-input.js';

async function note(context) {
  const [action, remaining] = splitArgument(context.argument);
  if (!action || action === 'list') return context.replyResult(await context.client.notes.list());
  if (action === 'delete') return context.replyResult(await context.client.notes.delete(required(remaining, '/note delete <ID>')));
  await context.replyResult(await context.client.notes.create(context.argument.trim()));
}

async function musicNote(context) {
  const [action, remaining] = splitArgument(context.argument);
  if (action === 'search') return context.replyResult(await context.client.notes.searchMusic(required(remaining, '/notemusic search <từ khóa>')));
  if (action !== 'create') throw new CommandError('Cách dùng: /notemusic search <từ khóa> hoặc /notemusic create <từ khóa bài hát> [| nội dung].');
  const separator = remaining.indexOf('|');
  const query = separator < 0 ? remaining : remaining.slice(0, separator);
  const text = separator < 0 ? '' : remaining.slice(separator + 1).trim();
  await context.replyResult(await context.client.notes.createMusic(required(query, '/notemusic create <từ khóa bài hát> [| nội dung]'), { text }));
}

export function noteCommands() {
  return [
    { name: 'note', usage: 'note [list | delete <ID> | <nội dung>]', admin: true, run: note },
    { name: 'notemusic', usage: 'notemusic <search từ khóa | create từ khóa [| nội dung]>', admin: true, run: musicNote },
  ];
}
