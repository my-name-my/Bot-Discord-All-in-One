const guildConfigService = require('../../services/guildConfigService');

module.exports = {
  name: 'goodbye',
  description: 'Configure the goodbye (leave) message',
  category: 'welcome',
  usage: 'goodbye <channel|message|toggle>',
  permissions: { tier: 'admin' },
  guildOnly: true,
  slash: true,
  subcommands: [
    { name: 'channel', description: 'Set / clear the goodbye channel', options: [{ name: 'channel', type: 'channel', description: 'Channel (omit to clear)', required: false }] },
    { name: 'message', description: 'Set the goodbye message', options: [{ name: 'text', type: 'string', description: 'Message text', required: true }] },
    { name: 'toggle', description: 'Enable or disable goodbye messages', options: [{ name: 'value', type: 'string', description: 'on | off', required: true, choices: [{ name: 'on', value: 'on' }, { name: 'off', value: 'off' }] }] },
  ],
  async run(ctx) {
    const sub = ctx.subcommand && ctx.subcommand.name;
    if (sub === 'channel') return channel(ctx);
    if (sub === 'message') return message(ctx);
    if (sub === 'toggle') return toggle(ctx);
    return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  },
};

async function channel(ctx) {
  const ch = ctx.getChannel('channel', null);
  await guildConfigService.update(ctx.guildId, { 'goodbye.channelId': ch ? ch.id : null });
  return ctx.sendSuccess(ch ? 'welcome.channelSet' : 'common.success', { channel: ch ? ch.id : '' });
}

async function message(ctx) {
  const text = ctx.getString('text');
  await guildConfigService.update(ctx.guildId, { 'goodbye.message': text });
  return ctx.sendSuccess('common.success');
}

async function toggle(ctx) {
  const on = ctx.getString('value') !== 'off';
  await guildConfigService.update(ctx.guildId, { 'goodbye.enabled': on });
  return ctx.sendSuccess('common.success', {}, { content: `✅ Goodbye ${on ? 'enabled' : 'disabled'}.` });
}
