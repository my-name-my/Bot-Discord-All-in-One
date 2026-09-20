/**
 * Prefix (message) command parser.
 *
 * "!ban @user spam" → { name: 'ban', args: ['<@123…>', 'spam'], raw: {...} }
 * Supports quoted arguments: !warn @user "being rude in #general"
 * Subcommands are passed through as leading args (e.g. "!role add …").
 */
const { Collection } = require('discord.js');

const MENTION_RE = /^<@!?(\d{17,20})>$/;
const CHANNEL_RE = /^<#(\d{17,20})>$/;
const ROLE_RE = /^<@&(\d{17,20})>$/;

function tokenize(content) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

/**
 * Map positional args onto the command's option definitions.
 * Options typed 'user' resolve via mentions/IDs; 'duration' stays a string.
 * @returns {{ options: object, members: object }}
 */
function resolveOptions(definition, args, message, subcommandDef) {
  const options = {};
  const members = {};
  const optionDefs = (subcommandDef && subcommandDef.options) || definition.options || [];
  let argIndex = 0;

  for (const optDef of optionDefs) {
    if (argIndex >= args.length && optDef.required) break;
    const token = args[argIndex];
    if (token === undefined || token === null) {
      if (optDef.default !== undefined) options[optDef.name] = optDef.default;
      continue;
    }

    switch (optDef.type) {
      case 'user':
      case 'member': {
        const mentionMatch = MENTION_RE.exec(token);
        const id = mentionMatch ? mentionMatch[1] : (/^\d{17,20}$/.test(token) ? token : null);
        let user = null;
        let member = null;
        if (id && message.guild) {
          member = message.guild.members.cache.get(id)
            || message.mentions.members.get(id)
            || null;
          user = member ? member.user : message.client.users.cache.get(id) || null;
        }
        if (user) {
          options[optDef.name] = user;
          if (member) members[optDef.name] = member;
          argIndex++;
        } else if (optDef.required) {
          // leave unresolved; handler's permission/validation layer reports it
          argIndex++;
        }
        break;
      }
      case 'channel': {
        const channelMatch = CHANNEL_RE.exec(token);
        const id = channelMatch ? channelMatch[1] : (/^\d{17,20}$/.test(token) ? token : null);
        const channel = id && message.guild ? message.guild.channels.cache.get(id) : null;
        if (channel) {
          options[optDef.name] = channel;
          argIndex++;
        }
        break;
      }
      case 'role': {
        const roleMatch = ROLE_RE.exec(token);
        const id = roleMatch ? roleMatch[1] : (/^\d{17,20}$/.test(token) ? token : null);
        const role = id && message.guild ? message.guild.roles.cache.get(id) : null;
        if (role) {
          options[optDef.name] = role;
          argIndex++;
        }
        break;
      }
      case 'int': {
        const n = parseInt(token, 10);
        if (!Number.isNaN(n)) {
          options[optDef.name] = n;
          argIndex++;
        }
        break;
      }
      case 'bool': {
        const v = String(token).toLowerCase();
        if (['true', 'yes', 'on', '1'].includes(v)) {
          options[optDef.name] = true;
          argIndex++;
        } else if (['false', 'no', 'off', '0'].includes(v)) {
          options[optDef.name] = false;
          argIndex++;
        }
        break;
      }
      default: {
        // string / duration: consume one token; if this is the LAST option,
        // consume the rest (free-text reason support).
        const isLast = argIndex === optionDefs.length - 1 || optionDefs.slice(argIndex + 1).every((o) => !o.required);
        if (isLast) {
          options[optDef.name] = args.slice(argIndex).join(' ');
          argIndex = args.length;
        } else {
          options[optDef.name] = token;
          argIndex++;
        }
      }
    }
  }

  return { options, members };
}

/**
 * Detect the active subcommand from leading args.
 * @returns {{ subcommand: object|null, remaining: string[] }}
 */
function extractSubcommand(definition, args) {
  if (!Array.isArray(definition.subcommands) || definition.subcommands.length === 0) {
    return { subcommand: null, remaining: args };
  }
  const [first, ...rest] = args;
  if (first === undefined) return { subcommand: null, remaining: args };
  const found = definition.subcommands.find((sub) => sub.name === first.toLowerCase() || (sub.aliases || []).includes(first.toLowerCase()));
  return found ? { subcommand: found, remaining: rest } : { subcommand: null, remaining: args };
}

/**
 * @param {Message} message
 * @param {string} prefix
 * @param {CommandLoader} loader
 * @returns {{ command: object|null, name: string, args: string[], subcommand: object|null, options: object, members: object }|null}
 */
function parse(message, prefix, loader) {
  const content = message.content || '';
  if (!content.toLowerCase().startsWith(prefix.toLowerCase())) return null;

  const body = content.slice(prefix.length).trim();
  if (!body) return null;

  const tokens = tokenize(body);
  const name = (tokens.shift() || '').toLowerCase();
  if (!name) return null;

  const command = loader.get(name);
  if (!command) return { command: null, name, args: tokens, subcommand: null, options: {}, members: {} };

  const { subcommand, remaining } = extractSubcommand(command, tokens);
  const { options, members } = resolveOptions(command, remaining, message, subcommand);

  return { command, name, args: remaining, subcommand, options, members };
}

module.exports = { parse, tokenize, extractSubcommand, resolveOptions };
