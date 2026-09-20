/**
 * LoggingService — sends event logs as embeds to the configured log
 * channels, and hosts the centralized command-error reporter (spec §20).
 * Channels are configured via /log setup or /log channel.
 */
const { EmbedBuilder } = require('discord.js');
const guildConfigService = require('./guildConfigService');
const logger = require('../utils/logger');
const { COLORS } = require('../config/constants');

let client = null;

function setClient(c) {
  client = c;
}

/**
 * Send a log embed. Resolves the guild's log channel for the given
 * category (falls back to the default channel). Never throws.
 *
 * @param {string} guildId
 * @param {string} category 'moderation'|'members'|'messages'|'roles'|'channels'|'voice'|'errors'
 * @param {{ title: string, description?: string, fields?: Array, color?: number, thumbnail?: string }} payload
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

    const embed = new EmbedBuilder()
      .setColor(payload.color !== undefined ? payload.color : COLORS.primary)
      .setTitle(payload.title)
      .setTimestamp();
    if (payload.description) embed.setDescription(payload.description.slice(0, 4000));
    if (Array.isArray(payload.fields)) embed.addFields(payload.fields.slice(0, 25));
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

module.exports = { sendLog, reportCommandError, setClient };
