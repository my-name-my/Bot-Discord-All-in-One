const guildConfigService = require('../../services/guildConfigService');
const i18nService = require('../../services/i18nService');
const config = require('../../config/config');
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');

const MODULE_KEYS = ['automod', 'logging', 'welcome', 'economy', 'levels', 'tickets', 'giveaways'];

module.exports = {
  name: 'config',
  description: 'Server configuration',
  category: 'config',
  usage: 'config <prefix|language|module|reset|view>',
  permissions: { tier: 'admin' },
  guildOnly: true,
  slash: true,
  subcommands: [
    { name: 'prefix', description: 'Change or view the command prefix', options: [{ name: 'value', type: 'string', description: 'New prefix (1-5 chars)', required: false }] },
    { name: 'language', description: 'Set the server language', options: [{ name: 'value', type: 'string', description: 'Language code', required: false, choices: [{ name: 'English', value: 'en' }, { name: 'Tiếng Việt', value: 'vi' }] }] },
    { name: 'module', description: 'Toggle a module on/off', options: [{ name: 'name', type: 'string', description: 'Module name', required: true }, { name: 'value', type: 'string', description: 'on | off', required: true, choices: [{ name: 'on', value: 'on' }, { name: 'off', value: 'off' }] }] },
    { name: 'reset', description: 'Reset this server\'s config to defaults', options: [{ name: 'confirm', type: 'bool', description: 'Confirm reset', required: true }] },
    { name: 'view', description: 'Show current server settings' },
  ],
  async run(ctx) {
    const sub = ctx.subcommand && ctx.subcommand.name;
    if (sub === 'prefix') return prefix(ctx);
    if (sub === 'language') return language(ctx);
    if (sub === 'module') return moduleToggle(ctx);
    if (sub === 'reset') return reset(ctx);
    if (sub === 'view') return view(ctx);
    return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  },
};

async function prefix(ctx) {
  const value = ctx.getString('value', null);
  if (value === null) {
    const cur = ctx.guildConfig.prefix || config.defaultPrefix;
    return ctx.sendInfo('common.success', {}, { content: `💈 Current prefix: \`${cur}\`` });
  }
  if (value.length < 1 || value.length > 5) return ctx.sendError('config.invalidPrefix', {}, {}, { ephemeral: true });
  await guildConfigService.update(ctx.guildId, { prefix: value });
  return ctx.sendSuccess('config.prefixSet', { prefix: value });
}

async function language(ctx) {
  const value = ctx.getString('value', null);
  const available = i18nService.locales();
  if (value === null) return ctx.sendInfo('common.success', {}, { content: `🌐 ${ctx.t('config.languageSet', { language: ctx.guildConfig.language || config.defaultLanguage })}` });
  if (!available.includes(value)) return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  await guildConfigService.update(ctx.guildId, { language: value });
  return ctx.sendSuccess('config.languageSet', { language: value });
}

async function moduleToggle(ctx) {
  const name = ctx.getString('name', '').toLowerCase();
  const on = ctx.getString('value', 'on');
  if (!MODULE_KEYS.includes(name)) return ctx.sendError('config.unknownModule', { module: name }, {}, { ephemeral: true });
  const enabled = on !== 'off';
  const gc = await guildConfigService.get(ctx.guildId);
  await guildConfigService.update(ctx.guildId, { [`modules.${name}`]: enabled });
  return ctx.sendSuccess('config.moduleToggled', { module: name, status: enabled ? ctx.t('common.enabled') : ctx.t('common.disabled') });
}

async function reset(ctx) {
  if (!ctx.getBool('confirm', false)) return ctx.sendInfo('common.success', {}, { content: '❌ Reset cancelled.' });
  await guildConfigService.update(ctx.guildId, {});
  guildConfigService.invalidate(ctx.guildId);
  return ctx.sendSuccess('config.resetDone');
}

async function view(ctx) {
  const gc = ctx.guildConfig;
  const curPrefix = gc.prefix || config.defaultPrefix;
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(ctx.t('config.title')).setTimestamp();
  embed.addFields(
    { name: '🔧 Prefix', value: `\`${curPrefix}\``, inline: true },
    { name: '🌐 Language', value: `\`${gc.language || config.defaultLanguage}\``, inline: true },
    { name: ctx.t('config.modules'), value: MODULE_KEYS.map((k) => `${gc.modules[k] ? '✅' : '❌'} ${k}`).join('\n') || '—', inline: false },
  );
  if (gc.logging?.defaultChannelId) embed.addFields({ name: '📝 ' + ctx.t('common.channel'), value: `<#${gc.logging.defaultChannelId}>`, inline: false });
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}
