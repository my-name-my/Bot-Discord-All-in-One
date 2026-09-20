const moderationService = require('../../services/moderationService');

module.exports = {
  name: 'unwarn',
  description: 'Remove a specific warning case',
  category: 'moderation',
  aliases: ['delwarn'],
  usage: 'unwarn <user> <case>',
  cooldown: { seconds: 3, scope: 'user' },
  permissions: { tier: 'mod' },
  guildOnly: true,
  slash: true,
  options: [
    { name: 'user', type: 'member', description: 'Member to remove a warning from', required: true },
    { name: 'case', type: 'int', description: 'Warning case number', required: true },
  ],
  async run(ctx) {
    const target = ctx.getMember('user');
    if (!target) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });
    const caseNumber = ctx.getInt('case');
    if (!caseNumber) return ctx.sendError('moderation.unwarnBadNumber', { prefix: ctx.prefix }, {}, { ephemeral: true });
    const r = await moderationService.removeWarning(ctx.guild, ctx.member, target, caseNumber);
    if (!r.ok) return ctx.sendError(r.reason, { number: caseNumber }, {}, { ephemeral: true });
    return ctx.sendSuccess('moderation.unwarned', { user: target.user.tag, number: caseNumber });
  },
};
