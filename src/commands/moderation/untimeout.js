const moderationService = require('../../services/moderationService');

module.exports = {
  name: 'untimeout',
  description: 'Remove a timeout from a member',
  category: 'moderation',
  aliases: ['uncuff'],
  usage: 'untimeout <user> [reason]',
  cooldown: { seconds: 3, scope: 'user' },
  permissions: { tier: 'mod', bot: ['ModerateMembers'] },
  guildOnly: true,
  slash: true,
  options: [
    { name: 'user', type: 'member', description: 'Member to un-timeout', required: true },
    { name: 'reason', type: 'string', description: 'Reason', required: false },
  ],
  async run(ctx) {
    const target = ctx.getMember('user');
    if (!target) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });
    const r = await moderationService.removeTimeout(ctx.guild, ctx.member, target, ctx.getString('reason', ctx.t('common.noReason')));
    if (!r.ok) return ctx.sendError(r.reason, {}, {}, { ephemeral: true });
    return ctx.sendSuccess('moderation.timeoutRemoved', { user: target.user.tag });
  },
};
