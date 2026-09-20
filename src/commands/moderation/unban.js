const moderationService = require('../../services/moderationService');

module.exports = {
  name: 'unban',
  description: 'Unban a previously banned user',
  category: 'moderation',
  aliases: ['unbanuser'],
  usage: 'unban <user> [reason]',
  cooldown: { seconds: 5, scope: 'user' },
  permissions: { tier: 'mod', bot: ['BanMembers'] },
  guildOnly: true,
  slash: true,
  options: [
    { name: 'user', type: 'user', description: 'User to unban', required: true },
    { name: 'reason', type: 'string', description: 'Reason for the unban', required: false },
  ],
  async run(ctx) {
    const target = ctx.getUser('user');
    if (!target) return ctx.sendError('common.userNotFound', {}, {}, { ephemeral: true });
    const bans = await ctx.guild.bans.fetch().catch(() => null);
    const banned = bans?.get(target.id);
    if (!banned) return ctx.sendError('moderation.unbanFail', {}, {}, { ephemeral: true });
    try {
      await ctx.guild.members.unban(target.id, moderationService.reason(ctx.getString('reason', ctx.t('common.noReason'))));
      await moderationService.logAction(ctx.guildId, 'moderation', {
        title: `🔓 ${target.tag} unbanned`,
        fields: [{ name: 'User', value: `${target.tag} (<@${target.id}>)`, inline: true }, { name: 'Moderator', value: ctx.user.tag, inline: true }],
        color: 0x57f287,
      });
      return ctx.sendSuccess('moderation.unbanSuccess', { user: target.tag });
    } catch (e) {
      return ctx.sendError('moderation.unbanFail', {}, {}, { ephemeral: true });
    }
  },
};
