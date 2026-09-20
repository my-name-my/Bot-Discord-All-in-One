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
    { name: 'channel', description: 'Set the default log channel', options: [{ name: 'channel', type: 'channel', description: 'Log channel', required: true }] },
    { name: 'category', description: 'Set or clear a category log channel', options: [{ name: 'name', type: 'string', description: 'Category', required: true, choices: CATEGORIES.map((c) => ({ name: c, value: c })) }, { name: 'channel', type: 'channel', description: 'Channel (omit to clear)', required: false }] },
    { name: 'toggle', description: 'Enable or disable logging', options: [{ name: 'value', type: 'string', description: 'on | off', required: true, choices: [{ name: 'on', value: 'on' }, { name: 'off', value: 'off' }] }] },
    { name: 'list', description: 'Show logging configuration' },
  ],
  async run(ctx) {
    const sub = ctx.subcommand && ctx.subcommand.name;
    // `setup` and `channel` are the same action: spec §4 documents
    // `/log setup` and `/log channel #logs` as equivalents.
    if (sub === 'setup' || sub === 'channel') return setDefaultChannel(ctx);
    if (sub === 'category') return category(ctx);
    if (sub === 'toggle') return toggle(ctx);
    if (sub === 'list') return list(ctx);
    return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  },
};

/** Warn (without failing) when the bot cannot actually post logs there. */
function canPost(ctx, channel) {
  const me = ctx.guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms) return true;
  return perms.has('SendMessages') && perms.has('EmbedLinks');
}

async function setDefaultChannel(ctx) {
  const channel = ctx.getChannel('channel');
  if (!channel?.isTextBased()) return ctx.sendError('common.channel', {}, {}, { ephemeral: true });
  await guildConfigService.update(ctx.guildId, { 'logging.defaultChannelId': channel.id, 'logging.enabled': true });
  if (!canPost(ctx, channel)) {
    return ctx.sendError('logging.missingPerms', { channel: channel.id }, {}, { ephemeral: true });
  }
  return ctx.sendSuccess('logging.channelSet', { channel: channel.id });
}

async function category(ctx) {
  const name = ctx.getString('name');
  if (!CATEGORIES.includes(name)) {
    return ctx.sendError('common.invalidInput', { reason: CATEGORIES.join(' | ') }, {}, { ephemeral: true });
  }
  const channel = ctx.getChannel('channel', null);
  if (channel && !channel.isTextBased()) return ctx.sendError('common.channel', {}, {}, { ephemeral: true });

  await guildConfigService.update(ctx.guildId, { [`logging.categories.${name}`]: channel ? channel.id : null });
  // Clearing used to reuse `logging.toggled`, which rendered a literal
  // "{status}" placeholder — it now has its own message.
  if (!channel) return ctx.sendSuccess('logging.categoryCleared', { category: name });
  if (!canPost(ctx, channel)) {
    return ctx.sendError('logging.missingPerms', { channel: channel.id }, {}, { ephemeral: true });
  }
  return ctx.sendSuccess('logging.categorySet', { category: name, channel: channel.id });
}

async function toggle(ctx) {
  const on = ctx.getString('value') !== 'off';
  await guildConfigService.update(ctx.guildId, { 'logging.enabled': on });
  return ctx.sendSuccess('logging.toggled', { status: on ? ctx.t('common.on') : ctx.t('common.off') });
}

async function list(ctx) {
  const gc = await guildConfigService.get(ctx.guildId);
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(ctx.t('logging.setupTitle')).setTimestamp();
  embed.addFields({ name: `🔧 ${ctx.t('common.enabled')}`, value: gc.logging.enabled ? ctx.t('common.yes') : ctx.t('common.no'), inline: true });
  embed.addFields({ name: ctx.t('logging.defaultChannel'), value: gc.logging.defaultChannelId ? `<#${gc.logging.defaultChannelId}>` : '—', inline: true });
  for (const cat of CATEGORIES) {
    const id = gc.logging.categories && gc.logging.categories[cat];
    embed.addFields({ name: cat, value: id ? `<#${id}>` : ctx.t('logging.usesDefault'), inline: true });
  }
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}
