const moderationService = require('../../services/moderationService');

module.exports = {
  name: 'kick',
  description: 'Kick a member from the server',
  category: 'moderation',
  aliases: ['k'],
  usage: 'kick <user> [reason]',
  cooldown: { seconds: 3, scope: 'user' },
  permissions: { tier: 'mod', bot: ['KickMembers'] },
  guildOnly: true,
  slash: true,
  options: [
    { name: 'user', type: 'member', description: 'Member to kick', required: true },
    { name: 'reason', type: 'string', description: 'Reason for the kick', required: false },
  ],
  async run(ctx) {
    const target = ctx.getMember('user');
    if (!target) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });
    const r = await moderationService.kick(ctx.guild, ctx.member, target, ctx.getString('reason', ctx.t('common.noReason')));
    if (!r.ok) return ctx.sendError(r.reason, {}, {}, { ephemeral: true });
    return ctx.sendSuccess('moderation.kickSuccess', { user: target.user.tag });
  },
};
