/**
 * messageUpdate — log edited messages (spec §4, category `messages`).
 *
 * Only *content* edits are logged: pin/unpin, embed updates and reaction
 * changes all emit messageUpdate with an identical content string, and a
 * partial old message has no cached content to compare against.
 */
const loggingService = require('../services/loggingService');
const { COLORS } = require('../config/constants');

module.exports = {
  name: 'messageUpdate',
  async execute(client, oldMessage, newMessage, ctx) {
    const message = newMessage;
    if (!message || !message.guild || !message.author) return;
    if (message.author.bot || message.author.id === client.user?.id) return;

    const before = oldMessage && typeof oldMessage.content === 'string' ? oldMessage.content : null;
    const after = typeof message.content === 'string' ? message.content : '';
    if (before === null || before === after) return;

    const cut = (text) => String(text || '').slice(0, 900).replace(/```/g, "'''");
    const jumpUrl = message.url || `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;

    await loggingService.sendLog(message.guild.id, 'messages', {
      titleKey: 'logging.events.messageEdit',
      description: `[${cut(after) || '(empty)'}](${jumpUrl})`,
      fields: [
        { nameKey: 'logging.fields.author', value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
        { nameKey: 'logging.fields.channel', value: `<#${message.channel.id}>`, inline: true },
        { nameKey: 'logging.fields.before', value: cut(before) || '(empty)' },
        { nameKey: 'logging.fields.after', value: cut(after) || '(empty)' },
      ],
      color: COLORS.warning,
    });
  },
};
