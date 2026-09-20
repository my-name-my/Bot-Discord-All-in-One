const { EmbedBuilder } = require('discord.js');
const { COLORS, XP } = require('../../config/constants');
const levelService = require('../../services/levelService');
const guildConfigService = require('../../services/guildConfigService');

const subcommands = [
  { name: 'rank', description: 'View your or a user level/rank', options: [{ name: 'user', type: 'user', description: 'User to check', required: false }] },
  { name: 'leaderboard', description: 'Top users by XP in this server' },
    { name: 'level', description: 'Info about a specific level', options: [{ name: 'level', type: 'int', description: 'Level number', required: false }] },
  { name: 'addxp', description: 'Grant XP to a member (ManageGuild)', options: [{ name: 'user', type: 'member', description: 'Target member', required: true }, { name: 'amount', type: 'int', description: 'Amount of XP', required: true }] },
];

const handlers = { rank: cmdRank, leaderboard: cmdLeaderboard, level: cmdLevel, addxp: cmdAddXp };

module.exports = {
  name: 'levels',
  description: 'Level & XP commands',
  category: 'levels', aliases: ['rank', 'xp'],
  usage: 'levels <rank|leaderboard|level>',
  cooldown: { seconds: 2, scope: 'user' }, permissions: { tier: 'member' },
  guildOnly: true, slash: true,
  subcommands,
  async run(ctx) {
    if (!ctx.subcommand || !ctx.subcommand.name) return ctx.sendInfo('help.commandNotFound', { name: 'levels' }, {}, { ephemeral: true });
    const handler = handlers[ctx.subcommand.name];
    return handler ? handler(ctx) : ctx.sendInfo('help.commandNotFound', { name: ctx.subcommand.name }, {}, { ephemeral: true });
  },
};

async function resolveTarget(ctx) {
  const user = ctx.getUser('user', ctx.user) || ctx.user;
  if (!ctx.guild) return { user, member: null };
  const member = ctx.guild.members.cache.get(user.id) || await ctx.guild.members.fetch(user.id).catch(() => null);
  return { user, member };
}

async function cmdRank(ctx) {
  const { user, member } = await resolveTarget(ctx);
  const record = await levelService.getRecord(ctx.guildId, user.id);
  const xp = record.xp || 0;
  const level = record.level || levelService.levelForXp(xp);
  const nextXp = levelService.xpForLevel(level + 1);
  const progress = nextXp ? Math.round(((xp - levelService.xpForLevel(level)) / (nextXp - levelService.xpForLevel(level))) * 25) : 25;
  const bar = '█'.repeat(progress) + '░'.repeat(Math.max(0, 25 - progress));
  const embed = new EmbedBuilder().setColor(COLORS.primary)
    .setTitle(ctx.t('levels.rankTitle', { user: user.tag || user.username }))
    .addFields(
      { name: 'Level', value: String(level), inline: true },
      { name: 'XP', value: `${xp.toLocaleString()} / ${nextXp.toLocaleString()}`, inline: true },
      { name: 'Progress', value: `\`${bar}\``, inline: false },
    );
  if (member) {
    embed.setThumbnail(member.displayAvatarURL({ size: 128 }));
  }
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdLeaderboard(ctx) {
  const rows = await levelService.leaderboard(ctx.guildId, 10);
  if (!rows.length) return ctx.sendError('levels.noData', {}, {}, { ephemeral: true });
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(ctx.t('levels.leaderboardTitle'));
  const desc = [];
  let pos = 0;
  for (const row of rows) {
    pos += 1;
    const user = ctx.client.users.cache.get(row.userId) || await ctx.client.users.fetch(row.userId).catch(() => null);
    desc.push(`**${pos}.** ${user ? (user.tag || user.username) : row.userId} — Level ${row.level}, ${row.xp} XP`);
  }
  embed.setDescription(desc.join('\n'));
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdLevel(ctx) {
  const level = ctx.getInt('level') || 1;
  if (level < 1) return ctx.sendError('levels.invalidLevel', {}, {}, { ephemeral: true });
  const xp = levelService.xpForLevel(level);
  const nextXp = levelService.xpForLevel(level + 1);
  const embed = new EmbedBuilder().setColor(COLORS.primary)
    .setTitle(ctx.t('levels.levelInfo', { level }))
    .addFields(
      { name: 'XP required', value: `${xp.toLocaleString()} XP` },
      { name: 'Next level at', value: `${nextXp.toLocaleString()} XP` },
    );
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdAddXp(ctx) {
  if (!ctx.member?.permissions?.has('ManageGuild')) return ctx.sendError('common.noPermissions', {}, {}, { ephemeral: true });
  const target = ctx.getMember('user', ctx.member);
  if (!target) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });
  const amount = ctx.getInt('amount');
  if (!amount || amount < 0) return ctx.sendError('common.invalidInput', { reason: 'amount must be a positive integer' }, {}, { ephemeral: true });
  await levelService.addXp(ctx.guildId, target.user.id, amount);
  return ctx.sendSuccess('levels.addXp', { user: target.user.tag, amount: amount.toString() }, {}, { ephemeral: true });
}
