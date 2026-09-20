/**
 * LoggingService — sends event logs as embeds to the configured log
 * channels, and hosts the centralized command-error reporter (spec §20).
 * Channels are configured via /log setup or /log channel.
 */
const { EmbedBuilder } = require('discord.js');
const guildConfigService = require('./guildConfigService');
const i18n = require('./i18nService');
const logger = require('../utils/logger');
const { COLORS } = require('../config/constants');

let client = null;

function setClient(c) {
  client = c;
}

/** Human-readable rendering of a value inside a change log. */
function formatValue(value) {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? '✅' : '❌';
  if (Array.isArray(value)) return `${value.length}`;
  return String(value);
}

/**
 * Build embed fields for the properties that actually changed.
 * Shared by role/channel/member events so the diff logic lives in one place.
 * Labels are passed as i18n keys (`logging.fields.*`) and translated inside
 * sendLog(), which already holds the guild language — no extra config read.
 *
 * @param {object|null} before
 * @param {object|null} after
 * @param {Record<string, string>} keys property → i18n key
 * @param {{ max?: number }} [options]
 * @returns {Array<{ nameKey: string, value: string, inline: boolean }>}
 */
function diff(before, after, keys, options = {}) {
  const fields = [];
  const max = options.max || 15;
  for (const [key, labelKey] of Object.entries(keys)) {
    const from = before ? before[key] : undefined;
    const to = after ? after[key] : undefined;
    const same = Array.isArray(from) && Array.isArray(to)
      ? from.length === to.length && from.every((v, i) => v === to[i])
      : from === to;
    if (same) continue;
    fields.push({ nameKey: labelKey, value: `${formatValue(from)} → ${formatValue(to)}`, inline: true });
    if (fields.length >= max) break;
  }
  return fields;
}

/**
 * Send a log embed. Resolves the guild's log channel for the given
 * category (falls back to the default channel). Never throws.
 *
 * @param {string} guildId
 * @param {string} category 'moderation'|'members'|'messages'|'roles'|'channels'|'voice'|'errors'
 * @param {{ title?: string, titleKey?: string, titleParams?: object, description?: string,
 *           fields?: Array, color?: number, thumbnail?: string }} payload
 *   `titleKey` is translated with the guild's language inside this function, so
 *   event handlers never need to fetch the config just to localise a title.
 */
async function sendLog(guildId, category, payload) {
  try {
    if (!guildId || !client) return;
    const config = await guildConfigService.get(guildId);
    if (!config.logging.enabled) return;

    const categoryId = (config.logging.categories && config.logging.categories[category]) || null;
    const channelId = categoryId || config.logging.defaultChannelId;
    if (!channelId) return;

    const guild = client.guilds.cache.get(guildId);
    const channel = guild ? guild.channels.cache.get(channelId) : null;
    if (!channel || !channel.isTextBased()) return;

    const botPerms = channel.permissionsFor(guild.members.me);
    if (!botPerms || !botPerms.has('SendMessages') || !botPerms.has('EmbedLinks')) return;

    const title = payload.titleKey
      ? i18n.translate(config.language, payload.titleKey, payload.titleParams)
      : payload.title;

    const embed = new EmbedBuilder()
      .setColor(payload.color !== undefined ? payload.color : COLORS.primary)
      .setTitle(title)
      .setTimestamp();
    if (payload.description) embed.setDescription(payload.description.slice(0, 4000));
    if (Array.isArray(payload.fields)) {
      embed.addFields(payload.fields.slice(0, 25).map((field) => ({
        name: (field.nameKey ? i18n.translate(config.language, field.nameKey) : field.name || '-').slice(0, 256),
        value: String(field.value === undefined || field.value === '' ? '-' : field.value).slice(0, 1024),
        inline: Boolean(field.inline),
      })));
    }
    if (payload.thumbnail) embed.setThumbnail(payload.thumbnail);

    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    logger.error('logging', `sendLog failed: ${error.message}`);
  }
}

/** Centralized command-error reporting to the guild's `errors` log channel. */
async function reportCommandError(context, error) {
  if (!context.guildId) return;
  await sendLog(context.guildId, 'errors', {
    title: '❌ Command error',
    description: [
      `**Command:** ${context.command ? context.command.name : 'unknown'}`,
      `**User:** ${context.user ? `${context.user.tag} (${context.user.id})` : 'unknown'}`,
      `**Channel:** ${context.channel ? context.channel.id : 'unknown'}`,
      '',
      '**Error (truncated, secrets stripped):**',
      `\`\`\`${String(error && error.message ? error.message : error).replace(/```/g, "'").slice(0, 500)}\`\`\``,
    ].join('\n'),
    color: COLORS.error,
  });
}

module.exports = { sendLog, reportCommandError, setClient, diff, formatValue };
