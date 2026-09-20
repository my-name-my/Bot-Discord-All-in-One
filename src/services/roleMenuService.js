/**
 * RoleMenuService — self-service role assignment via select menus and
 * button-role messages. (spec §6)
 *
 * Collection `rolemenus` doc:
 *   { id, guildId, channelId, messageId, type:'select'|'button',
 *     title, placeholder, options:[{label,description,emoji,roleId}],
 *     buttonStyle? }
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
  const select = new StringSelectMenuBuilder()
    .setCustomId(`rolemenu:select:${channel.id}`)
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
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(title || '🎭 Pick your roles').setTimestamp();
  const rows = [];
      for (let i = 0; i < options.length; i += 5) {
    const row = new ActionRowBuilder();
      for (let j = i; j < Math.min(i + 5, options.length); j++) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`rolemenu:btn:${options[j].roleId}`)
          .setLabel(options[j].label)
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

/** Toggle a role for a member; returns { added: bool, role: Role }. */
async function toggle(guildId, member, roleId) {
  const guild = member.guild;
  const role = guild.roles.cache.get(roleId);
  if (!role) return { added: false, role: null, error: 'noRole' };
  // Bot hierarchy check
  const me = guild.members.me;
  if (role.position >= me.roles.highest.position && guild.ownerId !== me.id) {
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
  return collection().find((doc) => doc.guildId === String(guildId)).sort((a, b) => b.createdAt - a.createdAt);
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

module.exports = { setClient, createSelect, createButtons, toggle, list, remove, byMessage, handleInteraction };
