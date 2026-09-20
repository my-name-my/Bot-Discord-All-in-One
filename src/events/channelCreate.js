/**
 * channelCreate — log new channels (spec §4, category `channels`).
 * discord.js v14 event args: (channel) — DMs have no guild and are skipped.
 */
const { ChannelType } = require('discord.js');
const loggingService = require('../services/loggingService');
const { findExecutor, AuditLogEvent } = require('../utils/auditLog');
const { COLORS } = require('../config/constants');

module.exports = {
  name: 'channelCreate',
  async execute(client, channel, ctx) {
    if (!channel || !channel.guild) return;
    const executor = await findExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);

    await loggingService.sendLog(channel.guild.id, 'channels', {
      titleKey: 'logging.events.channelCreate',
      description: `${channel} **${channel.name || '—'}**`,
      fields: [
        { nameKey: 'logging.fields.channel', value: `<#${channel.id}>`, inline: true },
        { nameKey: 'logging.fields.type', value: ChannelType[channel.type] || String(channel.type), inline: true },
        { nameKey: 'logging.fields.category', value: channel.parentId ? `<#${channel.parentId}>` : '—', inline: true },
        { nameKey: 'logging.fields.moderator', value: executor ? `<@${executor.id}>` : '—', inline: true },
      ],
      color: COLORS.success,
    });
  },
};
