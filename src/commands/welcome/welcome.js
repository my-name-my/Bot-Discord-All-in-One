const guildConfigService = require('../../services/guildConfigService');
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');

function scopeFields(prefix) {
  return [
    { name: `${prefix}channel`, type: 'channel', description: 'Channel to send messages in', required: false },
    { name: `${prefix}message`, type: 'string', description: 'Message template', required: false },
    { name: `${prefix}embed`, type: 'bool', description: 'Use an embed', required: false },
  ];
}

module.exports = {
  name: 'welcome',
  description: 'Configure the welcome message',
  category: 'welcome',
  usage: 'welcome <channel|message|autorole|toggle|test>',
  permissions: { tier: 'admin' },
  guildOnly: true,
  slash: true,
  subcommands: [
    { name: 'channel', description: 'Set / clear the welcome channel', options: [{ name: 'channel', type: 'channel', description: 'Channel (omit to clear)', required: false }] },
    { name: 'message', description: 'Set the welcome message', options: [{ name: 'text', type: 'string', description: 'Message text with placeholders', required: true }] },
    { name: 'autorole', description: 'Set / clear the auto-assigned role', options: [{ name: 'role', type: 'role', description: 'Role (omit to clear)', required: false }] },
    { name: 'embed', description: 'Toggle embed mode', options: [{ name: 'value', type: 'string', description: 'on | off', required: true, choices: [{ name: 'on', value: 'on' }, { name: 'off', value: 'off' }] }] },
    { name: 'toggle', description: 'Enable or disable welcome messages', options: [{ name: 'value', type: 'string', description: 'on | off', required: true, choices: [{ name: 'on', value: 'on' }, { name: 'off', value: 'off' }] }] },
    { name: 'test', description: 'Send a test welcome in this channel' },
  ],
  async run(ctx) {
    const sub = (ctx.subcommand && ctx.subcommand.name) || ctx.getString('sub', null);
    if (sub === 'channel') return channel(ctx);
    if (sub === 'message') return message(ctx);
    if (sub === 'autorole') return autorole(ctx);
    if (sub === 'embed') return embedToggle(ctx);
    if (sub === 'toggle') return toggle(ctx);
    if (sub === 'test') return testMsg(ctx);
    return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  },
};

async function channel(ctx) {
  const ch = ctx.getChannel('channel', null);
  if (ch && !ch.isTextBased()) {
    return ctx.sendError('welcome.mustBeText', {}, {}, { ephemeral: true });
  }
  await guildConfigService.update(ctx.guildId, { 'welcome.channelId': ch ? ch.id : null });
  if (ch) return ctx.sendSuccess('welcome.channelSet', { channel: `<#${ch.id}>` });
  return ctx.sendSuccess('welcome.channelCleared');
}

async function message(ctx) {
  const text = ctx.getString('text');
  if (!text || !text.trim()) return ctx.sendError('common.invalidInput', { reason: 'empty' }, {}, { ephemeral: true });
  if (text.length > 2000) return ctx.sendError('welcome.messageTooLong', {}, {}, { ephemeral: true });
  await guildConfigService.update(ctx.guildId, { 'welcome.message': text });
  return ctx.sendSuccess('welcome.messageSet');
}

async function autorole(ctx) {
  const role = ctx.getRole('role', null);
  if (role) {
    if (typeof role.editable === 'boolean' && !role.editable) {
      return ctx.sendError('welcome.roleTooHigh', {}, {}, { ephemeral: true });
    }
    await guildConfigService.update(ctx.guildId, { 'welcome.autoroleIds': [role.id] });
    return ctx.sendSuccess('welcome.autoroleSet', { role: role.name });
  }
  await guildConfigService.update(ctx.guildId, { 'welcome.autoroleIds': [] });
  return ctx.sendSuccess('welcome.autoroleOff');
}

async function embedToggle(ctx) {
  const on = ctx.getString('value') !== 'off';
  await guildConfigService.update(ctx.guildId, { 'welcome.embedEnabled': on });
  return ctx.sendSuccess('common.success', {}, { content: `✅ Welcome embed ${on ? 'on' : 'off'}.` });
}

async function toggle(ctx) {
  const on = ctx.getString('value') !== 'off';
  await guildConfigService.update(ctx.guildId, { 'welcome.enabled': on });
  return ctx.sendSuccess('common.success', {}, { content: `✅ Welcome ${on ? 'enabled' : 'disabled'}.` });
}

async function testMsg(ctx) {
  const placeholders = require('../../utils/placeholders');
  const { EmbedBuilder } = require('discord.js');
  const { COLORS } = require('../../config/constants');
  const gc = await guildConfigService.get(ctx.guildId);
  const fakeUser = ctx.user;
  const text = placeholders.applyPlaceholders(gc.welcome.message, { guild: ctx.guild, user: fakeUser });
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(ctx.t('welcome.previewTitle'))
    .setDescription(text || '(empty message)');
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}
