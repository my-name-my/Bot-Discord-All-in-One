/**
 * RoleMenuService — self-service role assignment via select menus and
 * button-role messages. (spec §6)
 *
 * Collection `rolemenus` doc:
 *   { id, guildId, channelId, messageId, type:'select'|'button'|'reaction',
 *     title, placeholder, options:[{label,description,emoji,roleId}] }
 *
 * The service sends the menu message, persists its id, and toggles roles
 * when members interact. No timers are needed; restore() just rebinds ids.
 */
const { getDatabase } = require('../database');
const { COLORS } = require('../config/constants');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');

const COLLECTION = 'rolemenus';
let client = null;

function setClient(c) { client = c; }
function collection() { return getDatabase().collection(COLLECTION); }
function byMessage(messageId) { return collection().get(messageId); }

async function createSelect({ guild, channel, title, placeholder, options }) {
  if (!Array.isArray(options) || !options.length) throw new Error('no-options');
  if (options.length > 25) throw new Error('too-many-options');
  const select = new StringSelectMenuBuilder()
    .setCustomId('rolemenu:select')
    .setPlaceholder(placeholder || 'Pick your roles…')
    .setMinValues(0)
    .setMaxValues(options.length);

  for (const opt of options) {
    select.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(String(opt.label).slice(0, 100))
        .setDescription(String(opt.description || '').slice(0, 100))
        .setValue(opt.roleId)
        .setEmoji(opt.emoji || undefined),
    );
  }

  const row = new ActionRowBuilder().addComponents(select);
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(title || '🎭 Pick your roles').setTimestamp();
  const message = await channel.send({ embeds: [embed], components: [row] });

  await collection().set(message.id, {
    id: message.id, guildId: guild.id, channelId: channel.id,
    messageId: message.id, type: 'select', title, placeholder, options,
  });
  return message;
}

async function createButtons({ guild, channel, title, options }) {
  if (!Array.isArray(options) || !options.length) throw new Error('no-options');
  if (options.length > 25) throw new Error('too-many-options');
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(title || '🎭 Pick your roles').setTimestamp();
  const rows = [];
      for (let i = 0; i < options.length; i += 5) {
    const row = new ActionRowBuilder();
      for (let j = i; j < Math.min(i + 5, options.length); j++) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`rolemenu:btn:${options[j].roleId}`)
          .setLabel(String(options[j].label).slice(0, 80))
          .setEmoji(options[j].emoji || undefined)
          .setStyle(ButtonStyle.Secondary),
      );
    }
    rows.push(row);
  }
  const message = await channel.send({ embeds: [embed], components: rows });
  await collection().set(message.id, {
    id: message.id, guildId: guild.id, channelId: channel.id,
    messageId: message.id, type: 'button', title, options,
  });
  return message;
}

/**
 * Create a reaction-role menu: bot reacts with each emoji, members gain/remove
 * the matching role on reaction add/remove. Emoji may be unicode ('🔹') or a
 * custom emoji id/name.
 */
async function createReactions({ guild, channel, title, options }) {
  if (!Array.isArray(options) || !options.length) throw new Error('no-options');
  if (options.length > 20) throw new Error('too-many-options');
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(title || 'React to get roles')
    .setDescription(options.map((o) => `${o.emoji || '🔹'} -> ${o.label || `<@&${o.roleId}>`}`).join('\n').slice(0, 4000))
    .setTimestamp();
  const message = await channel.send({ embeds: [embed] });
  const reacted = [];
  for (const opt of options) {
    try { await message.react(opt.emoji); reacted.push(opt); }
    catch (error) { logger.warn('rolemenu', `Could not react ${opt.emoji}: ${error.message}`); }
  }
  await collection().set(message.id, {
    id: message.id, guildId: guild.id, channelId: channel.id,
    messageId: message.id, type: 'reaction', title,
    reactionOptions: reacted.map((o) => ({ emoji: o.emoji, roleId: o.roleId })),
    options: reacted,
  });
  return message;
}

/** Normalize an emoji for comparison (unicode char or custom id). */
function emojiKey(emoji) {
  if (!emoji) return '';
  return String(emoji.id || emoji.name || emoji).toLowerCase();
}

/** Find the roleId bound to a reaction on a reaction-type menu doc. */
function roleIdForReaction(doc, emoji) {
  const key = emojiKey(emoji);
  const opts = (doc && (doc.reactionOptions || doc.options)) || [];
  for (const opt of opts) {
    if (String(opt.emoji || '').toLowerCase() === key || String(opt.emoji || '') === String(emoji.name || emoji)) return opt.roleId;
  }
  return null;
}

/** Toggle a role for a member; returns { added: bool, removed: bool, role: Role, error? }. */
async function toggle(guildId, member, roleId) {
  const guild = member.guild;
  const role = guild.roles.cache.get(roleId);
  if (!role) return { added: false, role: null, error: 'noRole' };
  // Bot hierarchy check — fail safe when the bot member is not cached yet.
  // role.editable is the same check discord.js runs internally (position +
  // managed + @everyone), but botCanManageRole behaviour must not throw.
  if (typeof role.editable === 'boolean' && !role.editable) {
    return { added: false, role, error: 'hierarchy' };
  }
  const me = guild.members.me;
  if (me && guild.ownerId !== me.id && role.position >= me.roles.highest.position) {
    return { added: false, role, error: 'hierarchy' };
  }
  const has = member.roles.cache.has(roleId);
  try {
    if (has) { await member.roles.remove(role, 'Role menu'); return { added: false, role, removed: true }; }
    else { await member.roles.add(role, 'Role menu'); return { added: true, role }; }
  } catch (error) {
    return { added: false, role, error: error.message };
  }
}

async function list(guildId) {
  const rows = await collection().find((doc) => doc.guildId === String(guildId));
  rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return rows;
}

async function remove(messageId) {
  const doc = await collection().get(messageId);
  await collection().delete(messageId);
  if (client && doc) {
    const channel = client.guilds.cache.get(doc.guildId)?.channels.cache.get(doc.channelId);
    if (channel) { const msg = await channel.messages.fetch(doc.messageId).catch(() => null); if (msg) await msg.delete().catch(() => {}); }
  }
  return doc;
}

function handleInteraction(interaction) { /* no-op; dispatch handled inline via customId */ }

module.exports = { setClient, createSelect, createButtons, createReactions, emojiKey, roleIdForReaction, toggle, list, remove, byMessage, handleInteraction };
