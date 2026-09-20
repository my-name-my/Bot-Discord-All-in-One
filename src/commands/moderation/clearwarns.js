const warningService = require('../../services/warningService');
const moderationService = require('../../services/moderationService');

module.exports = {
  name: 'clearwarns',
  description: 'Clear all warnings for a member',
  category: 'moderation',
  aliases: ['resetwarns'],
  usage: 'clearwarns <user>',
  cooldown: { seconds: 5, scope: 'user' },
  permissions: { tier: 'mod' },
  guildOnly: true,
  slash: true,
  options: [{ name: 'user', type: 'member', description: 'Member to clear', required: true }],
  async run(ctx) {
    const target = ctx.getMember('user');
    if (!target) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });
    const count = await warningService.clearCases(ctx.guildId, target.user.id);
    await moderationService.logAction(ctx.guildId, 'moderation', {
      title: `🧹 warnings cleared`,
      description: `${count} warning(s) removed for ${target.user.tag}`,
      fields: [{ name: 'Moderator', value: ctx.user.tag, inline: true }],
      color: 0xfee75c,
    });
    return ctx.sendSuccess('moderation.warnCleared', { user: target.user.tag, count });
  },
};
