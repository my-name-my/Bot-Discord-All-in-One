const moderationService = require('../../services/moderationService');
const { LIMITS } = require('../../config/constants');

module.exports = {
  name: 'purge',
  description: 'Bulk-delete recent messages',
  category: 'moderation',
  aliases: ['clear', 'c'],
  usage: 'purge <amount>',
  cooldown: { seconds: 5, scope: 'user' },
  permissions: { tier: 'mod', bot: ['ManageMessages'] },
  guildOnly: true,
  slash: true,
  options: [{ name: 'amount', type: 'int', description: `1–${LIMITS.purgeMax}`, required: true }],
  async run(ctx) {
    const amount = ctx.getInt('amount');
    if (amount == null || amount < 1) return ctx.sendError('moderation.purgeNothing', {}, {}, { ephemeral: true });
    if (amount > LIMITS.purgeMax) return ctx.sendError('moderation.purgeTooMany', { max: LIMITS.purgeMax }, {}, { ephemeral: true });
    const r = await moderationService.bulkDelete(ctx.channel, amount);
    if (!r.ok) return ctx.sendError(r.reason, {}, {}, { ephemeral: true });
    await moderationService.logAction(ctx.guildId, 'messages', {
      title: '🧹 Messages purged', description: `${r.deleted} message(s) deleted in <#${ctx.channel.id}>`,
      fields: [{ name: 'Moderator', value: ctx.user.tag, inline: true }], color: 0xfee75c,
    });
    return ctx.sendSuccess('moderation.purgeSuccess', { count: r.deleted });
  },
};
