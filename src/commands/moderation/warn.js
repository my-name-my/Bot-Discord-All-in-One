const moderationService = require('../../services/moderationService');
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');

module.exports = {
  name: 'warn',
  description: 'Warn a member and log the case',
  category: 'moderation',
  aliases: ['w'],
  usage: 'warn <user> [reason]',
  cooldown: { seconds: 3, scope: 'user' },
  permissions: { tier: 'mod', bot: ['ModerateMembers'] },
  guildOnly: true,
  slash: true,
  options: [
    { name: 'user', type: 'member', description: 'Member to warn', required: true },
    { name: 'reason', type: 'string', description: 'Reason for the warning', required: false },
    { name: 'notify', type: 'bool', description: 'DM the user about the warning', required: false },
  ],
  async run(ctx) {
    const target = ctx.getMember('user');
    if (!target) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });
    const reasonText = ctx.getString('reason', ctx.t('common.noReason'));
    const r = await moderationService.addWarning(ctx.guild, ctx.member, target, reasonText);
    if (!r.ok) return ctx.sendError(r.reason, {}, {}, { ephemeral: true });
    if (ctx.getBool('notify', false)) {
      const embed = new EmbedBuilder().setColor(COLORS.warning).setTitle('⚠️ You were warned').setDescription(`**Server:** ${ctx.guild.name}\n${ctx.t('common.reason')}: ${reasonText}\n${ctx.t('common.case', { number: r.number })}`);
      await target.send({ embeds: [embed] }).catch(() => {});
    }
    return ctx.sendSuccess('moderation.warned', { user: target.user.tag, count: r.total }, { allowedMentions: { parse: [] } });
  },
};
