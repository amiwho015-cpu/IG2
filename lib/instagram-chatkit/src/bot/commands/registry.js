import { systemCommands } from './system.js';
import { profileCommands } from './profile.js';
import { postCommands } from './posts.js';
import { noteCommands } from './notes.js';
import { threadCommands } from './threads.js';
import { messageCommands } from './messages.js';
import { preferenceCommands } from './preferences.js';

export function createCommandRegistry({ history, conversations, searchLimiter }) {
  const definitions = [
    ...systemCommands(), ...profileCommands(searchLimiter), ...postCommands(), ...noteCommands(),
    ...threadCommands(), ...messageCommands(), ...preferenceCommands({ history, conversations }),
  ];
  const commands = new Map(definitions.map(command => [command.name, command]));
  for (const [alias, target] of [['musicnote', 'notemusic']]) {
    const command = commands.get(target);
    commands.set(alias, { ...command, name: alias, usage: command.usage.replace(target, alias) });
  }
  return commands;
}
