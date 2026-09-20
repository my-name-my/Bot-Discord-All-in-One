/** Giveaway button route: join/leave. */
const giveawayService = require('../services/giveawayService');

function safeReply(interaction, content) {
  if (interaction.deferred && !interaction.replied) return interaction.followUp({ content, flags: 64 });
  return interaction.reply({ content, flags: 64 }).catch(() => {});
}

async function join({ interaction, t }) {
  const result = await giveawayService.toggleJoin(interaction.guildId, interaction.message.id, interaction.user.id);
  if (!result) return safeReply(interaction, { content: '❓ ' + t('giveaway.notFound') });
  if (result === 'joined') return safeReply(interaction, { content: t('giveaway.joined') });
  if (result === 'left') return safeReply(interaction, { content: t('giveaway.left') });
  return safeReply(interaction, { content: t('common.error') });
}

module.exports = { register(handler) { handler.registerComponent('giveaway', 'join', join); } };
