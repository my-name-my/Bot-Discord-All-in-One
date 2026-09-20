/**
 * messageDeleteBulk — log bulk deletions (purge command, other bots, Discord UI).
 * discord.js emits this instead of one messageDelete per message.
 * Args: (messages: Collection<Snowflake, Message>, channel: GuildTextBasedChannel)
 */
const loggingService = require('../services/loggingService');
const { COLORS } = require('../config/constants');

module.exports = {
  name: 'messageDeleteBulk',
  async execute(client, messages, channel, ctx) {
    const guild = channel && channel.guild;
    if (!guild || !messages) return;

    const authors = new Set();
    for (const message of messages.values()) {
      if (message.author && !message.author.bot) authors.add(message.author.id);
    }

    await loggingService.sendLog(guild.id, 'messages', {
      titleKey: 'logging.events.bulkDelete',
      description: `🧹 ${messages.size} message(s) bulk-deleted.`,
      fields: [
        { nameKey: 'logging.fields.channel', value: `<#${channel.id}>`, inline: true },
        { nameKey: 'logging.fields.count', value: String(messages.size), inline: true },
        { nameKey: 'logging.fields.authors', value: authors.size ? `<@${[...authors].slice(0, 10).join('>, <@')}>` : '—' },
      ],
      color: COLORS.error,
    });
  },
};
