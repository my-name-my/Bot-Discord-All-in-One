const moderationService = require('../../services/moderationService');

module.exports = {
  name: 'lock',
  description: 'Lock a channel so members cannot send messages',
  category: 'moderation',
  aliases: ['lockdown'],
  usage: 'lock [channel]',
  cooldown: { seconds: 5, scope: 'guild' },
  permissions: { tier: 'mod', bot: ['ManageChannels'] },
  guildOnly: true,
  slash: true,
  options: [{ name: 'channel', type: 'channel', description: 'Channel to lock (defaults to current)', required: false }],
  async run(ctx) {
    const channel = ctx.getChannel('channel', ctx.channel);
    if (!channel?.isTextBased()) return ctx.sendError('common.channel', {}, {}, { ephemeral: true });
    const r = await moderationService.setLock(channel, true, ctx.guild);
    if (!r.ok) return ctx.sendError(r.reason, {}, {}, { ephemeral: true });
    return ctx.sendSuccess('moderation.locked', { channel: channel.name || channel.id });
  },
};
