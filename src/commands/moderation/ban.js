const moderationService = require('../../services/moderationService');

module.exports = {
  name: 'ban',
  description: 'Ban a member from the server',
  category: 'moderation',
  aliases: ['banuser'],
  usage: 'ban <user> [reason]',
  cooldown: { seconds: 3, scope: 'user' },
  permissions: { tier: 'mod', bot: ['BanMembers'] },
  guildOnly: true,
  slash: true,
  options: [
    { name: 'user', type: 'member', description: 'Member to ban', required: true },
    { name: 'reason', type: 'string', description: 'Reason for the ban', required: false },
  ],
  async run(ctx) {
    let target = ctx.getMember('user');
    // Fallback: allow banning by user ID even if the user already left the guild.
    if (!target) {
      const user = ctx.getUser('user');
      if (user) {
        target = await ctx.guild.members.fetch(user.id).catch(() => null) || user;
      }
    }
    if (!target) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });
    const reasonText = ctx.getString('reason', ctx.t('common.noReason'));
    const r = await moderationService.ban(ctx.guild, ctx.member, target, reasonText);
    if (!r.ok) return ctx.sendError(r.reason, {}, {}, { ephemeral: true });
    return ctx.sendSuccess('moderation.banSuccess', { user: target.user ? target.user.tag : target.tag, reason: reasonText });
  },
};
