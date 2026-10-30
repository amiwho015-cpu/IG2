'use strict';

const EventEmitter = require('events');
const Events = require('../constants/events');

const ROLE_LEVEL = Object.freeze({ user: 0, admin: 1, owner: 2 });

/**
 * Command framework for building bots on top of InstaChatClient.
 *
 *  - prefix(es), aliases, per-command + per-user cooldowns
 *  - owner / admin roles
 *  - anti-spam (sliding window, temporary mute)
 *  - built-in `help`
 *  - safe execution: a crashing command never takes the bot down
 *
 * Usage:
 *   const bot = new CommandHandler(client, { prefix: '?', owners: ['12345'] });
 *   bot.register({ name: 'ping', run: (ctx) => ctx.reply('pong') });
 *   bot.attach();
 */
class CommandHandler extends EventEmitter {
  /**
   * @param {InstaChatClient} client
   * @param {Object} [options]
   * @param {string|string[]} [options.prefix='!']
   * @param {string[]} [options.owners]            User IDs with full access.
   * @param {string[]} [options.admins]            User IDs with admin access.
   * @param {number}  [options.cooldownMs=3000]    Default per-user, per-command cooldown.
   * @param {boolean} [options.caseSensitive=false]
   * @param {boolean} [options.typing=true]        Send typing indicator before running.
   * @param {boolean} [options.help=true]          Register built-in help command.
   * @param {Object|false} [options.spam]          { maxCommands: 6, windowMs: 8000, muteMs: 30000 }
   * @param {Function} [options.onUnknown]         (ctx) => void, called for unknown commands.
   */
  constructor(client, options = {}) {
    super();
    this.client = client;

    const prefixes = options.prefix === undefined ? ['!'] : [].concat(options.prefix);
    this.prefixes = prefixes.filter((p) => typeof p === 'string' && p.length > 0);
    if (this.prefixes.length === 0) this.prefixes = ['!'];
    // Longest prefix first so "!!" wins over "!"
    this.prefixes.sort((a, b) => b.length - a.length);

    this.owners = new Set((options.owners || []).map(String));
    this.admins = new Set((options.admins || []).map(String));
    this.defaultCooldownMs = options.cooldownMs !== undefined ? options.cooldownMs : 3000;
    this.caseSensitive = Boolean(options.caseSensitive);
    this.typing = options.typing !== false;
    this.onUnknown = options.onUnknown || null;

    this.spam = options.spam === false
      ? null
      : { maxCommands: 6, windowMs: 8000, muteMs: 30000, ...(options.spam || {}) };

    this.commands = new Map(); // name -> command
    this.aliases = new Map(); // alias -> name
    this._cooldowns = new Map(); // `${cmd}:${user}` -> expiresAt
    this._spamLog = new Map(); // user -> number[]
    this._muted = new Map(); // user -> expiresAt
    this._listener = null;

    if (options.help !== false) this._registerHelp();
  }

  // ---------- registration ----------

  /**
   * @param {Object} cmd
   * @param {string} cmd.name
   * @param {string[]} [cmd.aliases]
   * @param {string} [cmd.description]
   * @param {string} [cmd.usage]
   * @param {'user'|'admin'|'owner'} [cmd.role='user']
   * @param {number} [cmd.cooldownMs]
   * @param {boolean} [cmd.hidden]
   * @param {Function} cmd.run  async (ctx) => void
   */
  register(cmd) {
    if (!cmd || typeof cmd.name !== 'string' || !cmd.name.trim()) {
      throw new TypeError('Command requires a non-empty "name"');
    }
    if (typeof cmd.run !== 'function') {
      throw new TypeError(`Command "${cmd.name}" requires a run(ctx) function`);
    }
    const name = this._norm(cmd.name);
    const role = cmd.role || 'user';
    if (!(role in ROLE_LEVEL)) throw new TypeError(`Command "${cmd.name}" has invalid role "${role}"`);

    const entry = {
      name,
      aliases: (cmd.aliases || []).map((a) => this._norm(a)),
      description: cmd.description || '',
      usage: cmd.usage || '',
      role,
      cooldownMs: cmd.cooldownMs !== undefined ? cmd.cooldownMs : this.defaultCooldownMs,
      hidden: Boolean(cmd.hidden),
      run: cmd.run
    };

    this.commands.set(name, entry);
    for (const a of entry.aliases) this.aliases.set(a, name);
    return this;
  }

  registerAll(list = []) {
    for (const c of list) this.register(c);
    return this;
  }

  unregister(name) {
    const entry = this.commands.get(this._norm(name));
    if (!entry) return false;
    for (const a of entry.aliases) this.aliases.delete(a);
    return this.commands.delete(entry.name);
  }

  // ---------- roles ----------

  addAdmin(userId) { this.admins.add(String(userId)); return this; }
  removeAdmin(userId) { this.admins.delete(String(userId)); return this; }
  addOwner(userId) { this.owners.add(String(userId)); return this; }

  roleOf(userId) {
    const id = String(userId);
    if (this.owners.has(id)) return 'owner';
    if (this.admins.has(id)) return 'admin';
    return 'user';
  }

  // ---------- lifecycle ----------

  attach() {
    if (this._listener) return this;
    this._listener = (message) => {
      this.handle(message).catch((err) => this.emit('command_error', err, null));
    };
    this.client.on(Events.MESSAGE, this._listener);
    return this;
  }

  detach() {
    if (this._listener) {
      this.client.off(Events.MESSAGE, this._listener);
      this._listener = null;
    }
    return this;
  }

  // ---------- core ----------

  _norm(s) {
    const t = String(s).trim();
    return this.caseSensitive ? t : t.toLowerCase();
  }

  parse(text) {
    if (typeof text !== 'string') return null;
    const trimmed = text.trim();
    const prefix = this.prefixes.find((p) => trimmed.startsWith(p));
    if (!prefix) return null;

    const body = trimmed.slice(prefix.length).trim();
    if (!body) return null;

    const [first, ...rest] = body.split(/\s+/);
    const rawArgs = body.slice(first.length).trim();
    return { prefix, name: this._norm(first), args: rest, rawArgs };
  }

  resolve(name) {
    const direct = this.commands.get(name);
    if (direct) return direct;
    const via = this.aliases.get(name);
    return via ? this.commands.get(via) : null;
  }

  _isMuted(userId) {
    const until = this._muted.get(userId);
    if (!until) return false;
    if (Date.now() >= until) {
      this._muted.delete(userId);
      return false;
    }
    return true;
  }

  /** Returns true if the user just crossed the spam threshold. */
  _spamCheck(userId) {
    if (!this.spam) return false;
    const now = Date.now();
    const log = (this._spamLog.get(userId) || []).filter((t) => now - t < this.spam.windowMs);
    log.push(now);
    this._spamLog.set(userId, log);
    if (this._spamLog.size > 2000) this._spamLog.delete(this._spamLog.keys().next().value);

    if (log.length > this.spam.maxCommands) {
      this._muted.set(userId, now + this.spam.muteMs);
      this._spamLog.delete(userId);
      return true;
    }
    return false;
  }

  _buildContext(message, parsed, command) {
    const client = this.client;
    const threadId = message.threadId;
    const senderId = message.senderId;
    const role = this.roleOf(senderId);

    return {
      client,
      handler: this,
      message,
      threadId,
      senderId,
      sender: message.sender,
      prefix: parsed.prefix,
      commandName: command ? command.name : parsed.name,
      command,
      args: parsed.args,
      rawArgs: parsed.rawArgs,
      role,
      isOwner: role === 'owner',
      isAdmin: role === 'owner' || role === 'admin',
      send: (payload, opts) => client.sendMessage(threadId, payload, opts),
      reply: (payload, opts) => client.reply(threadId, message.id, payload, opts),
      react: (emoji = '❤️') => client.sendReaction(threadId, message.id, emoji),
      typing: (on = true) => client.sendTypingIndicator(threadId, on),
      ask: (options = {}) => client.awaitMessage({ threadId, senderId, ...options })
    };
  }

  /**
   * Handles one incoming message. Returns true if a command was executed.
   * Exposed so you can drive it manually / in tests.
   */
  async handle(message) {
    if (!message || message.isSelf) return false;

    const parsed = this.parse(message.text);
    if (!parsed) return false;

    const senderId = String(message.senderId);
    const command = this.resolve(parsed.name);
    const ctx = this._buildContext(message, parsed, command);

    if (this._isMuted(senderId) && ctx.role !== 'owner') {
      this.emit('blocked', ctx, 'muted');
      return false;
    }

    if (!command) {
      this.emit('unknown', ctx);
      if (this.onUnknown) await this._safe(ctx, () => this.onUnknown(ctx));
      return false;
    }

    if (ctx.role !== 'owner' && this._spamCheck(senderId)) {
      this.emit('blocked', ctx, 'spam');
      await this._safe(ctx, () => ctx.send('⛔ Too many commands. Please slow down.'));
      return false;
    }

    if (ROLE_LEVEL[ctx.role] < ROLE_LEVEL[command.role]) {
      this.emit('blocked', ctx, 'permission');
      await this._safe(ctx, () => ctx.reply(`🔒 "${command.name}" needs ${command.role} access.`));
      return false;
    }

    if (ctx.role !== 'owner' && command.cooldownMs > 0) {
      const key = `${command.name}:${senderId}`;
      const until = this._cooldowns.get(key) || 0;
      const now = Date.now();
      if (now < until) {
        const secs = Math.ceil((until - now) / 1000);
        this.emit('blocked', ctx, 'cooldown');
        await this._safe(ctx, () => ctx.reply(`⏳ Wait ${secs}s before using "${command.name}" again.`));
        return false;
      }
      this._cooldowns.set(key, now + command.cooldownMs);
      if (this._cooldowns.size > 5000) this._cooldowns.delete(this._cooldowns.keys().next().value);
    }

    this.emit(Events.COMMAND, ctx);

    try {
      if (this.typing) {
        await ctx.typing(true).catch(() => {});
      }
      await command.run(ctx);
      return true;
    } catch (err) {
      this.emit('command_error', err, ctx);
      await this._safe(ctx, () => ctx.reply(`❌ "${command.name}" failed: ${err.message || 'unknown error'}`));
      return false;
    }
  }

  async _safe(ctx, fn) {
    try {
      return await fn();
    } catch (err) {
      this.emit('command_error', err, ctx);
      return null;
    }
  }

  _registerHelp() {
    this.register({
      name: 'help',
      aliases: ['commands', 'h'],
      description: 'Show available commands',
      usage: 'help [command]',
      cooldownMs: 2000,
      run: async (ctx) => {
        const p = ctx.prefix;
        const target = ctx.args[0] ? this.resolve(this._norm(ctx.args[0])) : null;

        if (target) {
          const lines = [
            `${p}${target.name}${target.aliases.length ? ` (${target.aliases.join(', ')})` : ''}`,
            target.description || 'No description.',
            `Usage: ${p}${target.usage || target.name}`
          ];
          if (target.role !== 'user') lines.push(`Access: ${target.role}`);
          return ctx.reply(lines.join('\n'));
        }

        const visible = [...this.commands.values()].filter(
          (c) => !c.hidden && ROLE_LEVEL[ctx.role] >= ROLE_LEVEL[c.role]
        );
        const lines = visible.map((c) => `${p}${c.name}${c.description ? ` - ${c.description}` : ''}`);
        return ctx.reply(`Commands (${visible.length}):\n${lines.join('\n')}`);
      }
    });
  }
}

module.exports = CommandHandler;
