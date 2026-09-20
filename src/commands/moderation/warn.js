const moderationService = require('../../services/moderationService');
const guildConfigService = require('../../services/guildConfigService');
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

    // Optional DM — wording lives in locales (it used to be hard-coded English).
    if (ctx.getBool('notify', false)) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle(ctx.t('moderation.warnDmTitle'))
        .setDescription(ctx.t('moderation.warnNotifyDm', { server: ctx.guild.name, reason: reasonText, case: r.number }));
      await target.send({ embeds: [embed] }).catch(() => {});
    }

    // Configurable severity ladder (config.moderation.warnAutoPunish). Only the
    // AutoMod path used to honour it, so manual warnings never escalated even
    // though the ladder is documented as shared with /warn.
    const config = await guildConfigService.get(ctx.guildId);
    const escalation = await moderationService.applyWarnEscalation(ctx.guild, target, r.total, config, {
      reason: `Warned by ${ctx.user.tag}`,
    });

    const mentions = { allowedMentions: { parse: [] } };
    if (escalation) {
      return ctx.sendSuccess('moderation.warnEscalated', {
        user: target.user.tag, count: r.total, action: escalation.action, reason: reasonText,
      }, mentions);
    }
    return ctx.sendSuccess('moderation.warned', { user: target.user.tag, count: r.total, reason: reasonText }, mentions);
  },
};
