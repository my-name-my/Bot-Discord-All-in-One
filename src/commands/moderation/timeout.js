const moderationService = require('../../services/moderationService');
const { parseDuration } = require('../../utils/time');
const { LIMITS } = require('../../config/constants');

module.exports = {
  name: 'timeout',
  description: 'Timeout (mute) a member for a duration',
  category: 'moderation',
  aliases: ['mute', 'to'],
  usage: 'timeout <user> <duration> [reason]',
  cooldown: { seconds: 3, scope: 'user' },
  permissions: { tier: 'mod', bot: ['ModerateMembers'] },
  guildOnly: true,
  slash: true,
  options: [
    { name: 'user', type: 'member', description: 'Member to timeout', required: true },
    { name: 'duration', type: 'string', description: 'e.g. 10m, 1h, 2d', required: true },
    { name: 'reason', type: 'string', description: 'Reason', required: false },
  ],
  async run(ctx) {
    const target = ctx.getMember('user');
    if (!target) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });
    const ms = ctx.getDuration('duration');
    if (!ms) return ctx.sendError('moderation.timeoutInvalid', { max: '28d' }, {}, { ephemeral: true });
    const r = await moderationService.timeout(ctx.guild, ctx.member, target, ms, ctx.getString('reason', ctx.t('common.noReason')));
    if (!r.ok) return ctx.sendError(r.reason, {}, {}, { ephemeral: true });
    return ctx.sendSuccess('moderation.timeoutSet', { user: target.user.tag });
  },
};
