const guildConfigService = require('../../services/guildConfigService');
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');

const RULES = ['antiSpam', 'antiDuplicate', 'antiLink', 'antiInvite', 'antiMention', 'badWords', 'capsFilter', 'emojiSpam', 'massJoin'];
const MAX_BAD = 500;

async function getRulesConfig(ctx) {
  const gc = await guildConfigService.get(ctx.guildId);
  return gc.automod.rules;
}
const boolLabel = (v) => (v ? '✅' : '❌');

module.exports = {
  name: 'automod',
  description: 'Configure automated moderation',
  category: 'automod',
    usage: 'automod <status|toggle|rule|badword|ignore>',
  permissions: { tier: 'admin' },
  guildOnly: true,
  slash: true,
  subcommands: [
    { name: 'status', description: 'Show automod configuration' },
    { name: 'toggle', description: 'Enable or disable automod', options: [{ name: 'value', type: 'string', description: 'on | off', required: true, choices: [{ name: 'on', value: 'on' }, { name: 'off', value: 'off' }] }] },
    { name: 'rule', description: 'Toggle a rule on/off', options: [{ name: 'name', type: 'string', description: 'Rule name', required: true, choices: RULES.map((r) => ({ name: r, value: r })) }, { name: 'value', type: 'string', description: 'on | off', required: true, choices: [{ name: 'on', value: 'on' }, { name: 'off', value: 'off' }] }] },
    { name: 'badword', description: 'Manage bad words', options: [{ name: 'action', type: 'string', description: 'add | remove | list', required: true, choices: [{ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' }] }, { name: 'word', type: 'string', description: 'The word', required: false }] },
    { name: 'ignore', description: 'Manage ignored channels', options: [{ name: 'action', type: 'string', description: 'add | remove | list', required: true, choices: [{ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' }] }, { name: 'channel', type: 'channel', description: 'Channel to add/remove', required: false }] },
  ],
  async run(ctx) {
    const sub = ctx.subcommand && ctx.subcommand.name;
    if (sub === 'status') return status(ctx);
    if (sub === 'toggle') return toggle(ctx);
    if (sub === 'rule') return rule(ctx);
    if (sub === 'badword') return badword(ctx);
    if (sub === 'ignore') return ignore(ctx);
    return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  },
};

async function status(ctx) {
  const gc = await guildConfigService.get(ctx.guildId);
  const rules = gc.automod.rules;
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle('🛡️ AutoMod status').setTimestamp();
  embed.addFields({ name: 'Enabled', value: boolLabel(gc.automod.enabled) });
  for (const r of RULES) {
    const def = rules[r] || {};
    const on = def.enabled !== false;
    embed.addFields({ name: r, value: `${boolLabel(on)} (${def.action || 'delete'})`, inline: true });
  }
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function toggle(ctx) {
  const on = ctx.getString('value') !== 'off';
  await guildConfigService.update(ctx.guildId, { 'automod.enabled': on });
  return ctx.sendSuccess('automod.toggle', { status: on ? 'on' : 'off' });
}

async function rule(ctx) {
  const name = ctx.getString('name');
  const on = ctx.getString('value') !== 'off';
  await guildConfigService.update(ctx.guildId, { [`automod.rules.${name}.enabled`]: on });
  return ctx.sendSuccess('automod.rule', { rule: name, status: on ? ctx.t('common.on') : ctx.t('common.off') });
}

async function badword(ctx) {
  const action = ctx.getString('action');
  const gc = await guildConfigService.get(ctx.guildId);
  let words = Array.isArray((gc.automod.rules.badWords && gc.automod.rules.badWords.words)) ? gc.automod.rules.badWords.words : [];
  words = [...new Set(words.map((w) => String(w).toLowerCase()))];
  if (action === 'list') {
    const list = words.length ? words.map((w) => `\`${w}\``).join(', ') : '—';
    return ctx.sendInfo('common.success', {}, { content: `📝 Bad words (${words.length}/${MAX_BAD}): ${list}` });
  }
  const word = (ctx.getString('word') || '').toLowerCase().trim();
  if (!word) return ctx.sendError('common.invalidInput', { reason: 'provide a word' }, {}, { ephemeral: true });
  if (action === 'add') {
    if (words.length >= MAX_BAD) return ctx.sendError('common.error', {}, {}, { ephemeral: true });
    if (words.includes(word)) return ctx.sendSuccess('common.success', {}, { content: `✅ \`${word}\` already in list.` });
    words.push(word);
  } else if (action === 'remove') {
    const before = words.length;
    words = words.filter((w) => w !== word);
    if (words.length === before) return ctx.sendSuccess('common.success', {}, { content: `✅ \`${word}\` not in list.` });
  }
  await guildConfigService.update(ctx.guildId, { 'automod.rules.badWords.words': words });
  return ctx.sendSuccess('common.success', {}, { content: `✅ Bad words now: ${words.length}/${MAX_BAD}` });
}

async function ignore(ctx) {
  const action = ctx.getString('action');
  const gc = await guildConfigService.get(ctx.guildId);
  let ids = Array.isArray(gc.automod.ignoredChannelIds) ? [...gc.automod.ignoredChannelIds] : [];
  if (action === 'list') {
    const list = ids.length ? ids.map((id) => `<#${id}>`).join(', ') : '—';
    return ctx.sendInfo('common.success', {}, { content: `📝 Ignored channels: ${list}` });
  }
  const channel = ctx.getChannel('channel');
  if (!channel) return ctx.sendError('common.channel', {}, {}, { ephemeral: true });
  if (action === 'add') { if (!ids.includes(channel.id)) ids.push(channel.id); }
  else if (action === 'remove') { ids = ids.filter((id) => id !== channel.id); }
  await guildConfigService.update(ctx.guildId, { 'automod.ignoredChannelIds': ids });
  return ctx.sendSuccess('common.success', {}, { content: action === 'add' ? `✅ Ignored <#${channel.id}>` : `✅ Un-ignored <#${channel.id}>` });
}

//__SPLIT_MARKER__
