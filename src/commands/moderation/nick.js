const moderationService = require('../../services/moderationService');

module.exports = {
  name: 'nick',
  description: 'Change a members nickname',
  category: 'moderation',
  aliases: ['nickname'],
  usage: 'nick <user> [nickname|reset]',
  cooldown: { seconds: 3, scope: 'user' },
  permissions: { tier: 'mod', bot: ['ChangeNicknames'] },
  guildOnly: true,
  slash: true,
  options: [
    { name: 'user', type: 'member', description: 'Member to rename', required: true },
    { name: 'nickname', type: 'string', description: 'New nickname (omit to reset)', required: false },
  ],
  async run(ctx) {
    const target = ctx.getMember('user');
    if (!target) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });
    const nick = ctx.getString('nickname', null);
    const r = await moderationService.canModerate(ctx.member, target);
    if (!r.ok) return ctx.sendError(r.reason, {}, {}, { ephemeral: true });
    try {
      await target.setNickname(nick === null ? null : String(nick).slice(0, 32), 'Nickname updated');
      await moderationService.logAction(ctx.guildId, 'moderation', {
        title: '📝 Nickname changed', description: `${target.user.tag} is now "${nick === null ? '(reset)' : nick}"`,
        fields: [{ name: 'Moderator', value: ctx.user.tag, inline: true }], color: 0xfee75c,
      });
      return ctx.sendSuccess(nick === null ? 'moderation.nickRemoved' : 'moderation.nickChanged', { user: target.user.tag });
    } catch (e) {
      return ctx.sendError('moderation.nickFailed', {}, {}, { ephemeral: true });
    }
  },
};
