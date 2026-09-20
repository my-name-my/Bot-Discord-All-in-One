/**
 * Lệnh nhắc nhở — đặt / liệt kê / xóa reminder. (spec §11)
 * Dùng reminderService.schedule/list/remove.
 */
const { EmbedBuilder } = require('discord.js');
const { COLORS, LIMITS } = require('../../config/constants');
const { parseDuration, formatDuration } = require('../../utils/time');
const reminderService = require('../../services/reminderService');

module.exports = {
  name: 'remind',
  description: 'Set/list/remove reminders',
  category: 'reminders', aliases: ['reminder', 'reminders'],
  usage: 'remind <duration> <text> | remind list | remind remove <number>',
  cooldown: { seconds: 2, scope: 'user' }, permissions: { tier: 'member' },
  slash: true,
  subcommands: [
    { name: 'list', description: 'List your active reminders' },
    { name: 'remove', description: 'Remove a reminder by number', options: [{ name: 'number', type: 'int', description: 'Reminder number', required: true }] },
    { name: 'set', description: 'Set a new reminder', options: [{ name: 'duration', type: 'string', description: 'Duration e.g. 10m 2h', required: true }, { name: 'text', type: 'string', description: 'Reminder text', required: true }] },
  ],
  async run(ctx) {
    // Kiểu prefix: remind 10m làm gì đó
    if (!ctx.subcommand || !ctx.subcommand.name) {
      return handlePrefix(ctx);
    }
    const { name } = ctx.subcommand;
    if (name === 'set') return cmdSet(ctx);
    if (name === 'list') return cmdList(ctx);
    if (name === 'remove') return cmdRemove(ctx);
    return ctx.sendInfo('help.commandNotFound', { name: name }, {}, { ephemeral: true });
  },
};

async function handlePrefix(ctx) {
  // Vd: "!remind 10m làm gì đó" hoặc "!remind list" hoặc "!remind remove 2"
  const args = ctx.message?.content ? ctx.message.content.slice((ctx.prefix?.length || 1)).trim().split(/ +/) : [];
  const rest = args.slice(1); // bỏ tên lệnh 'remind'
  const first = (rest[0] || '').toLowerCase();
  if (first === 'list') return cmdList(ctx);
  if (first === 'remove') {
    const number = parseInt(rest[1], 10);
    if (Number.isNaN(number)) return ctx.sendError('reminders.invalidNumber', {}, {}, { ephemeral: true });
    ctx.options = { number };
    return cmdRemove(ctx);
  }
  const duration = parseDuration(first);
  const text = rest.slice(1).join(' ');
  if (!duration || !text) return ctx.sendError('reminders.usage', {}, {}, { ephemeral: true });
  if (duration > LIMITS.remindMaxMs) return ctx.sendError('utility.remindTooLong', {}, {}, { ephemeral: true });
  if (!ctx.guild || !ctx.channel) return ctx.sendError('common.guildOnly', {}, {}, { ephemeral: true });
  const doc = await reminderService.schedule(ctx.guildId, ctx.channel.id, ctx.user.id, text, duration);
  if (!doc) return ctx.sendError('reminders.setFailed', {}, {}, { ephemeral: true });
  return ctx.sendSuccess('utility.remindSet', { duration: formatDuration(duration, ctx.t.bind(ctx)), text }, {}, { ephemeral: true });
}

async function cmdSet(ctx) {
  const duration = parseDuration(ctx.getString('duration'));
  if (!duration) return ctx.sendError('utility.remindInvalidDuration', {}, {}, { ephemeral: true });
  if (duration > LIMITS.remindMaxMs) return ctx.sendError('utility.remindTooLong', {}, {}, { ephemeral: true });
  const text = ctx.getString('text');
  if (!text) return ctx.sendError('utility.remindNeedText', {}, {}, { ephemeral: true });
  if (!ctx.guild || !ctx.channel) return ctx.sendError('common.guildOnly', {}, {}, { ephemeral: true });
  await reminderService.schedule(ctx.guildId, ctx.channel.id, ctx.user.id, text, duration);
  return ctx.sendSuccess('utility.remindSet', { duration: formatDuration(duration, ctx.t.bind(ctx)), text }, {}, { ephemeral: true });
}

async function cmdList(ctx) {
  const reminders = await reminderService.list(ctx.user.id);
  if (!reminders.length) return ctx.sendError('reminders.empty', {}, {}, { ephemeral: true });
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle('⏰ Your reminders');
  embed.setDescription(reminders.map((r) => `#${r.number} — <t:${Math.floor(r.endsAt / 1000)}:R> — ${r.text}`).join('\n'));
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdRemove(ctx) {
  const number = ctx.getInt('number');
  if (!number || number < 1) return ctx.sendError('reminders.invalidNumber', {}, {}, { ephemeral: true });
  const ok = await reminderService.remove(ctx.user.id, number);
  if (!ok) return ctx.sendError('reminders.notFound', { number: number.toString() }, {}, { ephemeral: true });
  return ctx.sendSuccess('utility.remindDeleted', { number: number.toString() }, {}, { ephemeral: true });
}
