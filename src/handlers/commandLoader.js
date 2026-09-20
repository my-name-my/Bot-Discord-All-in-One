/**
 * Command loader — discovers command modules under src/commands/**.
 *
 * A command module exports:
 * {
 *   name: 'ban',                       // required, unique
 *   description: '...',                 // shown in slash UI
 *   category: 'moderation',            // folder name
 *   aliases: ['b'],                    // prefix-only
 *   usage: 'ban <user> [reason]',      // help text
 *   examples: ['ban @user spam'],
 *   permissions: { tier: 'mod', bot: ['BanMembers'] },
 *   cooldown: { seconds: 3, scope: 'user' },
 *   module: 'moderation',              // guildConfig.modules key to gate on
 *   guildOnly: true,
 *   slash: true,                       // register as slash command
 *   options: [ { name, type, description, required } ],   // slash options
 *   subcommands: [ { name, description, options } ],      // optional
 *   run: async (ctx) => {}             // shared business logic
 * }
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class CommandLoader {
  constructor() {
    /** @type {Map<string, object>} name/alias → command */
    this.commands = new Map();
    /** @type {Map<string, object>} canonical name → command */
    this.byName = new Map();
    /** @type {Map<string, string[]>} category → names */
    this.categories = new Map();
  }

  /**
   * @param {string} commandsDir absolute path to src/commands
   * @returns {Promise<{ loaded: number, errors: string[] }>}
   */
  async load(commandsDir) {
    this.commands.clear();
    this.byName.clear();
    this.categories.clear();
    const errors = [];

    if (!fs.existsSync(commandsDir)) {
      logger.warn('commands', `Directory not found: ${commandsDir}`);
      return { loaded: 0, errors };
    }

    const categories = fs.readdirSync(commandsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    let loaded = 0;
    for (const category of categories) {
      const dir = path.join(commandsDir, category);
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          delete require.cache[require.resolve(filePath)];
          const definition = require(filePath);
          if (!definition || !definition.name || typeof definition.run !== 'function') {
            errors.push(`${filePath}: missing name or run()`);
            continue;
          }
          definition.category = definition.category || category;
          this.register(definition);
          loaded++;
        } catch (error) {
          errors.push(`${filePath}: ${error.message}`);
        }
      }
    }

    logger.info('commands', `Loaded ${loaded} command(s) across ${this.categories.size} categories`);
    if (errors.length) {
      for (const error of errors) logger.error('commands', error);
    }
    return { loaded, errors };
  }

  register(definition) {
    this.byName.set(definition.name, definition);
    this.commands.set(definition.name, definition);
    for (const alias of definition.aliases || []) {
      if (this.commands.has(alias)) {
        logger.warn('commands', `Alias conflict: "${alias}" already mapped — skipping`);
        continue;
      }
      this.commands.set(alias, definition);
    }
    if (!this.categories.has(definition.category)) this.categories.set(definition.category, []);
    this.categories.get(definition.category).push(definition.name);
  }

  get(name) {
    return this.commands.get(String(name).toLowerCase()) || null;
  }

  /** All canonical commands (no alias duplicates). */
  all() {
    return [...this.byName.values()];
  }

  /** Build the "Command name → command" map for the help paginator. */
  listByCategory() {
    const result = [];
    for (const [category, names] of this.categories) {
      result.push({ category, commands: names.map((n) => this.byName.get(n)).filter(Boolean) });
    }
    return result;
  }
}

module.exports = { CommandLoader };
