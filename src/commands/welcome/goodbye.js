const guildConfigService = require('../../services/guildConfigService');

module.exports = {
  name: 'goodbye',
  description: 'Configure the goodbye (leave) message',
  category: 'welcome',
  usage: 'goodbye <channel|message|toggle|test>',
  permissions: { tier: 'admin' },
  guildOnly: true,
  slash: true,
  subcommands: [
    { name: 'channel', description: 'Set / clear the goodbye channel', options: [{ name: 'channel', type: 'channel', description: 'Channel (omit to clear)', required: false }] },
    { name: 'message', description: 'Set the goodbye message', options: [{ name: 'text', type: 'string', description: 'Message text', required: true }] },
    { name: 'embed', description: 'Toggle embed mode', options: [{ name: 'value', type: 'string', description: 'on | off', required: true, choices: [{ name: 'on', value: 'on' }, { name: 'off', value: 'off' }] }] },
    { name: 'toggle', description: 'Enable or disable goodbye messages', options: [{ name: 'value', type: 'string', description: 'on | off', required: true, choices: [{ name: 'on', value: 'on' }, { name: 'off', value: 'off' }] }] },
    { name: 'test', description: 'Preview the goodbye message' },
  ],
  async run(ctx) {
    const sub = (ctx.subcommand && ctx.subcommand.name) || ctx.getString('sub', null);
    if (sub === 'channel') return channel(ctx);
    if (sub === 'message') return message(ctx);
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
  await guildConfigService.update(ctx.guildId, { 'goodbye.channelId': ch ? ch.id : null });
  if (ch) return ctx.sendSuccess('welcome.channelSet', { channel: `<#${ch.id}>` });
  return ctx.sendSuccess('welcome.channelCleared');
}

async function message(ctx) {
  const text = ctx.getString('text');
  if (!text || !text.trim()) return ctx.sendError('common.invalidInput', { reason: 'empty' }, {}, { ephemeral: true });
  if (text.length > 2000) return ctx.sendError('welcome.messageTooLong', {}, {}, { ephemeral: true });
  await guildConfigService.update(ctx.guildId, { 'goodbye.message': text });
  return ctx.sendSuccess('welcome.messageSet');
}

async function embedToggle(ctx) {
  const on = ctx.getString('value') !== 'off';
  await guildConfigService.update(ctx.guildId, { 'goodbye.embedEnabled': on });
  return ctx.sendSuccess('common.success', {}, { content: `✅ Goodbye embed ${on ? 'on' : 'off'}.` });
}

async function toggle(ctx) {
  const on = ctx.getString('value') !== 'off';
  await guildConfigService.update(ctx.guildId, { 'goodbye.enabled': on });
  return ctx.sendSuccess('common.success', {}, { content: `✅ Goodbye ${on ? 'enabled' : 'disabled'}.` });
}

async function testMsg(ctx) {
  const placeholders = require('../../utils/placeholders');
  const { EmbedBuilder } = require('discord.js');
  const { COLORS } = require('../../config/constants');
  const gc = await guildConfigService.get(ctx.guildId);
  const text = placeholders.applyPlaceholders(gc.goodbye.message, { guild: ctx.guild, user: ctx.user });
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(ctx.t('welcome.previewTitle'))
    .setDescription(text || '(empty message)');
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}
