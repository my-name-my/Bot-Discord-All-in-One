const moderationService = require('../../services/moderationService');
const { LIMITS } = require('../../config/constants');

module.exports = {
  name: 'slowmode',
  description: 'Set the slowmode for a channel (seconds, 0 to reset)',
  category: 'moderation',
  aliases: ['slow'],
  usage: 'slowmode [seconds] [channel]',
  cooldown: { seconds: 5, scope: 'guild' },
  permissions: { tier: 'mod', bot: ['ManageChannels'] },
  guildOnly: true,
  slash: true,
  options: [
    { name: 'seconds', type: 'int', description: `0–${LIMITS.slowmodeMax}`, required: true },
    { name: 'channel', type: 'channel', description: 'Channel to update (defaults to current)', required: false },
  ],
  async run(ctx) {
    const seconds = ctx.getInt('seconds', 0);
    const channel = ctx.getChannel('channel', ctx.channel);
    if (!channel?.isTextBased()) return ctx.sendError('common.channel', {}, {}, { ephemeral: true });
    const clamped = Math.max(0, Math.min(seconds, LIMITS.slowmodeMax));
    const r = await moderationService.setSlowmode(channel, clamped);
    if (!r.ok) return ctx.sendError(r.reason, {}, {}, { ephemeral: true });
    const label = clamped === 0 ? ctx.t('moderation.slowmodeOff') : ctx.t('moderation.slowmodeSet', { seconds: clamped });
    return ctx.sendSuccess(label);
  },
};
