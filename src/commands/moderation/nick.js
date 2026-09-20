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
      // Deliberately no log call here: the `guildMemberUpdate` event is the
      // single owner of nickname logging. It also catches changes made outside
      // the bot and attributes them from the audit log. Writing a log here too
      // would duplicate every /nick (see src/events/guildMemberUpdate.js).
      await target.setNickname(nick === null ? null : String(nick).slice(0, 32), `Nickname updated by ${ctx.user.tag}`);
      return ctx.sendSuccess(nick === null ? 'moderation.nickRemoved' : 'moderation.nickChanged', { user: target.user.tag });
    } catch (e) {
      return ctx.sendError('moderation.nickFailed', {}, {}, { ephemeral: true });
    }
  },
};
