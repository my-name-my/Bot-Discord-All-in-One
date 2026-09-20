const warningService = require('../../services/warningService');
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');

module.exports = {
  name: 'warnings',
  description: 'View warnings for a member',
  category: 'moderation',
  aliases: ['warns', 'warnlist'],
  usage: 'warnings [user]',
  cooldown: { seconds: 5, scope: 'user' },
  permissions: { tier: 'mod' },
  guildOnly: true,
  slash: true,
  options: [{ name: 'user', type: 'member', description: 'Member to inspect', required: false }],
  async run(ctx) {
    const target = ctx.getMember('user', ctx.member);
    const cases = await warningService.getCases(ctx.guildId, target.user.id);
    if (!cases.length) return ctx.sendInfo('moderation.noWarnings', { user: target.user.tag });
    const embed = new EmbedBuilder().setColor(COLORS.warning).setTitle(ctx.t('moderation.warningsTitle', { user: target.user.tag })).setTimestamp();
    for (const c of cases) {
      const mod = await ctx.guild.members.fetch(c.moderatorId).then((m) => m?.user?.tag || c.moderatorId).catch(() => c.moderatorId);
      embed.addFields({ name: `#${c.number} — ${new Date(c.at).toLocaleDateString()}`, value: `**${ctx.t('common.reason')}:** ${c.reason}\n**Mod:** ${mod}`, inline: false });
    }
    embed.setFooter({ text: ctx.t('moderation.warningsCount', { count: cases.length }) });
    return ctx.reply({ embeds: [embed] }, { ephemeral: true });
  },
};
