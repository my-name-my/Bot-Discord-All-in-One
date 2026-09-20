const warningService = require('../../services/warningService');
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');

// Discord rejects embeds with more than 25 fields, so a member with 26+ warnings
// used to make this command fail with a generic error.
const MAX_FIELDS = 25;

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

    const shown = cases.slice(-MAX_FIELDS); // newest cases, capped to the embed limit
    const embed = new EmbedBuilder().setColor(COLORS.warning).setTitle(ctx.t('moderation.warningsTitle', { user: target.user.tag })).setTimestamp();
    for (const c of shown) {
      // Cache first: fetching one member per case burned rate limit on long lists.
      const cached = ctx.guild.members.cache.get(c.moderatorId);
      const mod = cached ? cached.user.tag : c.moderatorId;
      embed.addFields({
        name: `#${c.number} — ${new Date(c.at).toLocaleDateString()}`,
        value: `**${ctx.t('common.reason')}:** ${c.reason}\n**${ctx.t('common.by')}:** ${mod}`,
        inline: false,
      });
    }
    const footer = ctx.t('moderation.warningsCount', { count: cases.length })
      + (cases.length > MAX_FIELDS ? ` • ${ctx.t('moderation.warningsTruncated', { shown: shown.length, total: cases.length })}` : '');
    embed.setFooter({ text: footer });
    return ctx.reply({ embeds: [embed] }, { ephemeral: true });
  },
};
