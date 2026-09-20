/**
 * messageDelete — log deleted messages (spec §4, category `messages`).
 *
 * Deliberate filters:
 *  - bot/self messages are skipped: ticket and giveaway embeds are
 *    edited/deleted by the bot constantly and would flood the log channel;
 *  - uncached (partial) messages have no author, so they cannot be attributed.
 */
const loggingService = require('../services/loggingService');
const { COLORS } = require('../config/constants');

module.exports = {
  name: 'messageDelete',
  async execute(client, message, ctx) {
    if (!message || !message.guild || message.system) return;
    if (!message.author || message.author.bot) return;
    if (message.author.id === client.user?.id) return;

    const content = String(message.content || '').slice(0, 1000).replace(/```/g, "'''");
    const attachments = message.attachments ? message.attachments.size : 0;
    const description = [
      content ? `\`\`\`${content}\`\`\`` : null,
      attachments ? `📎 ${attachments}` : null,
    ].filter(Boolean).join('\n') || null;

    await loggingService.sendLog(message.guild.id, 'messages', {
      titleKey: 'logging.events.messageDelete',
      description,
      fields: [
        { nameKey: 'logging.fields.author', value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
        { nameKey: 'logging.fields.channel', value: `<#${message.channel.id}>`, inline: true },
      ],
      thumbnail: message.author.displayAvatarURL ? message.author.displayAvatarURL({ size: 128 }) : null,
      color: COLORS.error,
    });
  },
};
