/**
 * Lệnh thông báo — liệt kê / xóa nguồn feed. (spec §15)
 * Thêm nguồn mới cần tham số; subcommand `setup` sẽ hỏi type/source.
 */
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');
const notificationService = require('../../services/notificationService');

module.exports = {
  name: 'notify',
  description: 'Notification source commands',
  category: 'notifications', aliases: ['notification', 'notif'],
  usage: 'notify <list|remove|add>',
  cooldown: { seconds: 2, scope: 'user' }, permissions: { tier: 'mod' },
  guildOnly: true, slash: true,
  subcommands: [
    { name: 'list', description: 'List notification sources in this server' },
    { name: 'remove', description: 'Remove a notification source', options: [{ name: 'type', type: 'string', description: 'youtube|twitch|rss', required: true }, { name: 'source', type: 'string', description: 'Channel ID / URL', required: true }] },
    { name: 'add', description: 'Add a notification source', options: [{ name: 'type', type: 'string', description: 'youtube|twitch|rss', required: true }, { name: 'source', type: 'string', description: 'Channel ID or RSS URL', required: true }, { name: 'channel', type: 'channel', description: 'Target channel', required: true }, { name: 'ping_role', type: 'role', description: 'Role to ping', required: false }, { name: 'template', type: 'string', description: 'Template like {title}\\n{link}', required: false }] },
  ],
  async run(ctx) {
    if (!ctx.subcommand || !ctx.subcommand.name) return ctx.sendInfo('help.commandNotFound', { name: 'notify' }, {}, { ephemeral: true });
    if (handlers[ctx.subcommand.name]) return handlers[ctx.subcommand.name](ctx);
    return ctx.sendInfo('help.commandNotFound', { name: ctx.subcommand.name }, {}, { ephemeral: true });
  },
};

const handlers = { list: cmdList, remove: cmdRemove, add: cmdAdd };

async function cmdList(ctx) {
  const rows = await notificationService.list(ctx.guildId);
  if (!rows.length) return ctx.reply({ content: ctx.t('notify.listEmpty') }, { ephemeral: true });
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(ctx.t('notify.listTitle'));
  embed.setDescription(rows.map((r) => `**${r.type}** — \`${r.sourceId}\` → <#${r.channelId}> (ping: ${r.pingRoleId ? `<@&${r.pingRoleId}>` : '—'})`).join('\n'));
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdRemove(ctx) {
  const type = ctx.getString('type');
  const source = ctx.getString('source');
  if (!['youtube', 'twitch', 'rss'].includes(type)) return ctx.sendError('notify.invalidType', {}, {}, { ephemeral: true });
  await notificationService.remove(ctx.guildId, type, source);
  return ctx.sendSuccess('notify.sourceRemoved', { type, source }, {}, { ephemeral: true });
}

async function cmdAdd(ctx) {
  const type = ctx.getString('type');
  if (!['youtube', 'twitch', 'rss'].includes(type)) return ctx.sendError('notify.invalidType', {}, {}, { ephemeral: true });
  const source = ctx.getString('source');
  if (!source) return ctx.sendError('notify.sourceInvalid', {}, {}, { ephemeral: true });
  if (type === 'youtube' && !require('../../config/config').youtube?.apiKey) return ctx.sendError('notify.youtubeNeedKey', {}, {}, { ephemeral: true });
  const channel = ctx.getChannel('channel');
  if (!channel || !channel.isTextBased()) return ctx.sendError('notify.sourceInvalid', {}, {}, { ephemeral: true });
  const pingRoleId = ctx.getRole('ping_role')?.id || null;
  const template = ctx.getString('template') || '{title}\n{link}';
  await notificationService.add(ctx.guildId, type, source, channel.id, template, pingRoleId);
  return ctx.sendSuccess('notify.sourceSet', { type, channel: channel.toString() }, {}, { ephemeral: true });
}
