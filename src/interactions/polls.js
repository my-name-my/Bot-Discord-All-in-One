/** Poll vote button route: poll:vote:{optionIndex}. */
const pollService = require('../services/pollService');

function safeReply(interaction, content) {
  if (interaction.deferred && !interaction.replied) return interaction.followUp({ content, flags: 64 });
  return interaction.reply({ content, flags: 64 }).catch(() => {});
}

async function vote({ interaction, params, t }) {
  const idx = parseInt(params[0], 10);
  if (Number.isNaN(idx)) return safeReply(interaction, { content: t('common.error') });
  const result = await pollService.vote(interaction.guildId, interaction.message.id, interaction.user.id, idx);
  if (result) return safeReply(interaction, { content: t('utility.pollVoted') });
  return safeReply(interaction, { content: t('giveaway.notFound') });
}

module.exports = { register(handler) { handler.registerComponent('poll', 'vote', vote); } };
