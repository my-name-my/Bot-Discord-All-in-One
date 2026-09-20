const moderationService = require('../../services/moderationService');

module.exports = {
  name: 'unlock',
  description: 'Unlock a previously locked channel',
  category: 'moderation',
  aliases: ['unlockdown'],
  usage: 'unlock [channel]',
  cooldown: { seconds: 5, scope: 'guild' },
  permissions: { tier: 'mod', bot: ['ManageChannels'] },
  guildOnly: true,
  slash: true,
  options: [{ name: 'channel', type: 'channel', description: 'Channel to unlock (defaults to current)', required: false }],
  async run(ctx) {
    const channel = ctx.getChannel('channel', ctx.channel);
    if (!channel?.isTextBased()) return ctx.sendError('common.channel', {}, {}, { ephemeral: true });
    const r = await moderationService.setLock(channel, false, ctx.guild);
    if (!r.ok) return ctx.sendError(r.reason, {}, {}, { ephemeral: true });
    return ctx.sendSuccess('moderation.unlocked', { channel: channel.name || channel.id });
  },
};
