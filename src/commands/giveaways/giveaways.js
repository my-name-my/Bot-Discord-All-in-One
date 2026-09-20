/**
 * Lệnh giveaway — tạo / kết thúc sớm / quay lại / liệt kê. (spec §8)
 * Lệnh create cần duration + prize (+ tùy chọn winners/role/age).
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS, LIMITS } = require('../../config/constants');
const { parseDuration, formatDuration } = require('../../utils/time');
const giveawayService = require('../../services/giveawayService');

const subcommands = [
  { name: 'create', description: 'Create a new giveaway', options: [
    { name: 'duration', type: 'string', description: 'Duration e.g. 1h 30m', required: true },
    { name: 'prize', type: 'string', description: 'Prize for the winner(s)', required: true },
    { name: 'winners', type: 'int', description: 'Number of winners', required: false },
    { name: 'required_role', type: 'role', description: 'Required role to enter', required: false },
    { name: 'min_account_age', type: 'int', description: 'Min account age in days', required: false },
  ] },
  { name: 'end', description: 'End a giveaway early (by message id)', options: [{ name: 'message_id', type: 'string', description: 'Giveaway message id', required: true }] },
  { name: 'reroll', description: 'Reroll a finished giveaway', options: [{ name: 'message_id', type: 'string', description: 'Giveaway message id', required: true }] },
  { name: 'list', description: 'List active giveaways in this server' },
];

const handlers = { create: cmdCreate, end: cmdEnd, reroll: cmdReroll, list: cmdList };

module.exports = {
  name: 'giveaway',
  description: 'Giveaway commands',
  category: 'giveaways', aliases: ['giveaways', 'gaw'],
  usage: 'giveaway <create|end|reroll|list>',
  cooldown: { seconds: 3, scope: 'user' }, permissions: { tier: 'mod' },
  guildOnly: true, slash: true,
  subcommands,
  async run(ctx) {
    if (!ctx.subcommand || !ctx.subcommand.name) return ctx.sendInfo('help.commandNotFound', { name: 'giveaway' }, {}, { ephemeral: true });
    const handler = handlers[ctx.subcommand.name];
    return handler ? handler(ctx) : ctx.sendInfo('help.commandNotFound', { name: ctx.subcommand.name }, {}, { ephemeral: true });
  },
};

async function cmdCreate(ctx) {
  const duration = parseDuration(ctx.getString('duration'));
  if (!duration || duration < LIMITS.giveawayMinDurationMs || duration > LIMITS.giveawayMaxDurationMs) {
    return ctx.sendError('giveaway.invalidDuration', { min: formatDuration(LIMITS.giveawayMinDurationMs), max: formatDuration(LIMITS.giveawayMaxDurationMs) }, {}, { ephemeral: true });
  }
  const prize = ctx.getString('prize');
  if (!prize) return ctx.sendError('giveaway.needPrize', {}, {}, { ephemeral: true });
  const winners = Math.max(1, Math.min(LIMITS.giveawayMaxWinners, ctx.getInt('winners') || 1));
  const requiredRoleId = ctx.getRole('required_role')?.id || null;
  const minAccountAgeDays = ctx.getInt('min_account_age') || 0;
  if (!ctx.guild || !ctx.channel?.isTextBased()) return ctx.sendError('common.guildOnly', {}, {}, { ephemeral: true });
  await giveawayService.create({
    guild: ctx.guild, channel: ctx.channel, hostId: ctx.user.id,
    prize, winners, durationMs: duration, requiredRoleId, minAccountAgeDays,
  });
  return ctx.sendSuccess('giveaway.created', { duration: formatDuration(duration, ctx.t.bind(ctx)) }, {}, { ephemeral: true });
}

async function cmdEnd(ctx) {
  const messageId = ctx.getString('message_id');
  const doc = await giveawayService.get(ctx.guildId, messageId);
  if (!doc || doc.ended) return ctx.sendError('giveaway.notFound', {}, {}, { ephemeral: true });
  const { winners } = await giveawayService.end(ctx.guildId, messageId);
  return ctx.sendSuccess('giveaway.ended', { winners: (winners || []).map((w) => `<@${w}>`).join(', ') || '—' }, {}, { ephemeral: false });
}

async function cmdReroll(ctx) {
  const messageId = ctx.getString('message_id');
  const winner = await giveawayService.reroll(ctx.guildId, messageId);
  if (!winner) return ctx.sendError('giveaway.rerollFailed', {}, {}, { ephemeral: true });
  return ctx.reply({ content: ctx.t('giveaway.rerolled', { user: `<@${winner}>` }) }, { ephemeral: false });
}

async function cmdList(ctx) {
  const rows = await giveawayService.listActive(ctx.guildId);
  if (!rows.length) return ctx.sendError('giveaway.noActive', {}, {}, { ephemeral: true });
  const embed = new EmbedBuilder().setColor(COLORS.giveaway).setTitle('🎉 Active giveaways');
  embed.setDescription(rows.map((g) => `**${g.prize}** — ends <t:${Math.floor(g.endsAt / 1000)}:R>`));
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}
