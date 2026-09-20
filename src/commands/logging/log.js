const guildConfigService = require('../../services/guildConfigService');
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');

const CATEGORIES = ['moderation', 'members', 'messages', 'roles', 'channels', 'voice', 'errors'];

module.exports = {
  name: 'log',
  description: 'Configure moderation and event logging',
  category: 'logging',
  aliases: ['logging'],
  usage: 'log <setup|category|toggle|list>',
  permissions: { tier: 'admin' },
  guildOnly: true,
  slash: true,
  subcommands: [
    { name: 'setup', description: 'Set the default log channel', options: [{ name: 'channel', type: 'channel', description: 'Log channel', required: true }] },
    { name: 'category', description: 'Set or clear a category log channel', options: [{ name: 'name', type: 'string', description: 'Category', required: true, choices: CATEGORIES.map((c) => ({ name: c, value: c })) }, { name: 'channel', type: 'channel', description: 'Channel (omit to clear)', required: false }] },
    { name: 'toggle', description: 'Enable or disable logging', options: [{ name: 'value', type: 'string', description: 'on | off', required: true, choices: [{ name: 'on', value: 'on' }, { name: 'off', value: 'off' }] }] },
    { name: 'list', description: 'Show logging configuration' },
  ],
  async run(ctx) {
    const sub = ctx.subcommand && ctx.subcommand.name;
    if (sub === 'setup') return setup(ctx);
    if (sub === 'category') return category(ctx);
    if (sub === 'toggle') return toggle(ctx);
    if (sub === 'list') return list(ctx);
    return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  },
};

async function setup(ctx) {
  const channel = ctx.getChannel('channel');
  if (!channel?.isTextBased()) return ctx.sendError('common.channel', {}, {}, { ephemeral: true });
  await guildConfigService.update(ctx.guildId, { 'logging.defaultChannelId': channel.id });
  await guildConfigService.update(ctx.guildId, { 'logging.enabled': true });
  return ctx.sendSuccess('logging.channelSet', { channel: channel.id });
}

async function category(ctx) {
  const name = ctx.getString('name');
  const channel = ctx.getChannel('channel', null);
  const value = channel ? channel.id : null;
  await guildConfigService.update(ctx.guildId, { [`logging.categories.${name}`]: value });
  return ctx.sendSuccess(channel ? 'logging.categorySet' : 'logging.toggled', { channel: channel ? channel.id : name, category: name });
}

async function toggle(ctx) {
  const on = ctx.getString('value') !== 'off';
  await guildConfigService.update(ctx.guildId, { 'logging.enabled': on });
  return ctx.sendSuccess('logging.toggled', { status: on ? ctx.t('common.on') : ctx.t('common.off') });
}

async function list(ctx) {
  const gc = await guildConfigService.get(ctx.guildId);
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(ctx.t('logging.setupTitle')).setTimestamp();
  embed.addFields({ name: '🔧 ' + ctx.t('common.enabled'), value: bool(gc.logging.enabled), inline: true });
  embed.addFields({ name: ctx.t('logging.channelSet'), value: gc.logging.defaultChannelId ? `<#${gc.logging.defaultChannelId}>` : '—', inline: true });
  for (const cat of CATEGORIES) {
    const id = gc.logging.categories && gc.logging.categories[cat];
    embed.addFields({ name: cat, value: id ? `<#${id}>` : 'default', inline: true });
  }
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}
function bool(v) { return v ? '✅ Enabled' : '❌ Disabled'; }
