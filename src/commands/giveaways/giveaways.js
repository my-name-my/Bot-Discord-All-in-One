/**
 * Lệnh giveaway — tạo / kết thúc sớm / quay lại / liệt kê. (spec §8)
 * Lệnh create cần duration + prize (+ tùy chọn winners/role/age).
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS, LIMITS, PERMISSION_TIERS } = require('../../config/constants');
const { parseDuration, formatDuration } = require('../../utils/time');
const giveawayService = require('../../services/giveawayService');
const permissionService = require('../../services/permissionService');

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

/**
 * Quyền dùng lệnh giveaway: tier >= mod, HOẶC người dùng có một role trong
 * `giveaways.managerRoleIds` của guild (field này trước đây nằm trong config
 * nhưng không nơi nào đọc → đặt role quản lý giveaway không có tác dụng).
 * Vì vậy command khai báo tier 'member' và tự kiểm tra ở đây.
 */
function canManage(ctx) {
  const tier = permissionService.getTier({
    member: ctx.member,
    userId: ctx.user ? ctx.user.id : null,
    guildConfig: ctx.guildConfig,
    client: ctx.client,
  });
  if (tier >= PERMISSION_TIERS.mod) return true;
  const managerRoleIds = (ctx.guildConfig && ctx.guildConfig.giveaways
    && ctx.guildConfig.giveaways.managerRoleIds) || [];
  if (!managerRoleIds.length || !ctx.member || !ctx.member.roles) return false;
  return managerRoleIds.some((roleId) => ctx.member.roles.cache.has(roleId));
}

module.exports = {
  name: 'giveaway',
  description: 'Giveaway commands',
  category: 'giveaways', aliases: ['giveaways', 'gaw'],
  usage: 'giveaway <create|end|reroll|list>',
  cooldown: { seconds: 3, scope: 'user' }, permissions: { tier: 'member', bot: ['SendMessages', 'EmbedLinks'] },
  guildOnly: true, slash: true,
  subcommands,
  async run(ctx) {
    if (!ctx.subcommand || !ctx.subcommand.name) return ctx.sendInfo('help.commandNotFound', { name: 'giveaway' }, {}, { ephemeral: true });
    if (!canManage(ctx)) return ctx.sendError('common.noPermissions', {}, {}, { ephemeral: true });
    const handler = handlers[ctx.subcommand.name];
    return handler ? handler(ctx) : ctx.sendInfo('help.commandNotFound', { name: ctx.subcommand.name }, {}, { ephemeral: true });
  },
};

async function cmdCreate(ctx) {
  const raw = ctx.getString('duration');
  const duration = parseDuration(raw);
  if (!duration) return ctx.sendError('giveaway.invalidDuration', {}, {}, { ephemeral: true });
  if (duration < LIMITS.giveawayMinDurationMs || duration > LIMITS.giveawayMaxDurationMs) {
    // `durationInvalid` mới là key có placeholder {min}/{max}; trước đây params
    // bị truyền vào `invalidDuration` (không có placeholder) nên bị bỏ đi.
    return ctx.sendError('giveaway.durationInvalid', {
      min: formatDuration(LIMITS.giveawayMinDurationMs, ctx.t.bind(ctx)),
      max: formatDuration(LIMITS.giveawayMaxDurationMs, ctx.t.bind(ctx)),
    }, {}, { ephemeral: true });
  }
  const prize = (ctx.getString('prize') || '').trim();
  if (!prize) return ctx.sendError('giveaway.needPrize', {}, {}, { ephemeral: true });

  // Prefix command truyền option dạng chuỗi: `getInt` có thể trả NaN khi người
  // dùng gõ `!giveaway create 1h giải 5abc` → chặn thay vì lặng lẽ dùng mặc định.
  const winners = ctx.getInt('winners', 1);
  if (!Number.isFinite(winners) || winners < 1 || winners > LIMITS.giveawayMaxWinners) {
    return ctx.sendError('giveaway.winnersInvalid', { max: LIMITS.giveawayMaxWinners }, {}, { ephemeral: true });
  }
  const minAccountAgeDays = ctx.getInt('min_account_age', 0);
  if (!Number.isFinite(minAccountAgeDays) || minAccountAgeDays < 0
    || minAccountAgeDays > LIMITS.giveawayMaxAccountAgeDays) {
    return ctx.sendError('giveaway.ageInvalid', { max: LIMITS.giveawayMaxAccountAgeDays }, {}, { ephemeral: true });
  }
  const requiredRoleId = ctx.getRole('required_role')?.id || null;
  if (!ctx.guild || !ctx.channel?.isTextBased()) return ctx.sendError('common.guildOnly', {}, {}, { ephemeral: true });
  await giveawayService.create({
    guild: ctx.guild, channel: ctx.channel, hostId: ctx.user.id,
    prize, winners, durationMs: duration, requiredRoleId, minAccountAgeDays,
    lang: ctx.language,
  });
  return ctx.sendSuccess('giveaway.created', { duration: formatDuration(duration, ctx.t.bind(ctx)) }, {}, { ephemeral: true });
}

async function cmdEnd(ctx) {
  const messageId = ctx.getString('message_id');
  const doc = await giveawayService.get(ctx.guildId, messageId);
  if (!doc || doc.ended) return ctx.sendError('giveaway.notFound', {}, {}, { ephemeral: true });
  const { winners } = await giveawayService.end(ctx.guildId, messageId);
  const list = (winners || []).map((w) => `<@${w}>`).join(', ');
  if (!list) return ctx.sendInfo('giveaway.noParticipants', {}, {}, { ephemeral: false });
  return ctx.sendSuccess('giveaway.endedEarly', { winners: list }, {}, { ephemeral: false });
}

async function cmdReroll(ctx) {
  const messageId = ctx.getString('message_id');
  const winner = await giveawayService.reroll(ctx.guildId, messageId);
  if (!winner) return ctx.sendError('giveaway.rerollFailed', {}, {}, { ephemeral: true });
  return ctx.reply({ content: ctx.t('giveaway.rerolled', { user: `<@${winner}>` }) }, { ephemeral: false });
}

async function cmdList(ctx) {
  const rows = await giveawayService.listActive(ctx.guildId);
  // Danh sách rỗng là trạng thái bình thường, không phải lỗi.
  if (!rows.length) return ctx.sendInfo('giveaway.noActive', {}, {}, { ephemeral: true });
  const embed = new EmbedBuilder()
    .setColor(COLORS.giveaway)
    .setTitle(ctx.t('giveaway.listTitle'))
    // Trước đây truyền thẳng array vào setDescription → discord.js nối bằng dấu
    // phẩy nên cả danh sách dồn thành một dòng.
    .setDescription(rows.map((g) => ctx.t('giveaway.listLine', {
      prize: g.prize,
      relative: `<t:${Math.floor(g.endsAt / 1000)}:R>`,
      count: (g.participants || []).length,
    })).join('\n'));
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}
