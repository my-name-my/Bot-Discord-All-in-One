/**
 * Lệnh tiện ích — các subcommand meta/tiện ích. (spec §16)
 *
 * Subcommand: ping, uptime, botinfo, avatar, banner, userinfo,
 * serverinfo, membercount, roleinfo, channelinfo, emoji, invite,
 * poll, remind.
 *
 * Cả đường slash lẫn prefix đều chạy qua cùng các hàm xử lý.
 */
const { EmbedBuilder } = require('discord.js');
const { COLORS, LIMITS } = require('../../config/constants');
const { parseDuration, formatDuration } = require('../../utils/time');
const pollService = require('../../services/pollService');
const reminderService = require('../../services/reminderService');

const subcommands = [
  { name: 'ping', description: 'Check bot latency and database health' },
  { name: 'uptime', description: 'Show how long the bot has been online' },
  { name: 'botinfo', description: 'Information about the bot' },
  { name: 'avatar', description: 'Show a user avatar', options: [{ name: 'user', type: 'user', description: 'User to show', required: false }] },
  { name: 'banner', description: 'Show a user banner', options: [{ name: 'user', type: 'user', description: 'User to show', required: false }] },
  { name: 'userinfo', description: 'Show info about a user', options: [{ name: 'user', type: 'user', description: 'User to inspect', required: false }] },
  { name: 'serverinfo', description: 'Show info about this server' },
  { name: 'membercount', description: 'Show the server member count' },
  { name: 'roleinfo', description: 'Show info about a role', options: [{ name: 'role', type: 'role', description: 'Role to inspect', required: true }] },
  { name: 'channelinfo', description: 'Show info about a channel', options: [{ name: 'channel', type: 'channel', description: 'Channel to inspect', required: false }] },
  { name: 'emoji', description: 'List custom emojis of this server' },
  { name: 'invite', description: 'Generate an invite link for this server', options: [{ name: 'max_age', type: 'int', description: 'Max age in seconds', required: false }, { name: 'max_uses', type: 'int', description: 'Max uses', required: false }] },
  { name: 'poll', description: 'Create a poll', options: [{ name: 'question', type: 'string', description: 'Poll question', required: true }, { name: 'options', type: 'string', description: 'Semicolon separated options', required: true }, { name: 'duration', type: 'string', description: 'Duration e.g. 1h', required: false }, { name: 'anonymous', type: 'bool', description: 'Hide voters', required: false }, { name: 'multi', type: 'bool', description: 'Allow multiple votes', required: false }] },
  { name: 'remind', description: 'Set a reminder', options: [{ name: 'duration', type: 'string', description: 'Duration e.g. 10m', required: true }, { name: 'text', type: 'string', description: 'Reminder text', required: true }] },
];

const handlers = {
  ping: cmdPing, uptime: cmdUptime, botinfo: cmdBotinfo, avatar: cmdAvatar, banner: cmdBanner,
  userinfo: cmdUserinfo, serverinfo: cmdServerinfo, membercount: cmdMembercount, roleinfo: cmdRoleinfo,
  channelinfo: cmdChannelinfo, emoji: cmdEmoji, invite: cmdInvite, poll: cmdPoll, remind: cmdRemind,
};

module.exports = {
  name: 'utility',
  description: 'Utility commands (ping, info, avatar, poll, remind…)',
  category: 'utility', aliases: [],
  usage: 'utility <ping|avatar|userinfo|serverinfo|poll|remind…>',
  cooldown: { seconds: 0, scope: 'user' }, permissions: { tier: 'member' },
  guildOnly: true, slash: true,
  subcommands,
  async run(ctx) {
    if (!ctx.subcommand || !ctx.subcommand.name) return ctx.sendInfo('help.commandNotFound', { name: 'utility' }, {}, { ephemeral: true });
    const handler = handlers[ctx.subcommand.name];
    return handler ? handler(ctx) : ctx.sendInfo('help.commandNotFound', { name: ctx.subcommand.name }, {}, { ephemeral: true });
  },
};

async function cmdPing(ctx) {
  const ws = Math.round(ctx.client.ws.ping);
  const before = Date.now();
  try { await ctx.client.db?.ping?.(); } catch { /* ignore */ }
  const dbMs = Date.now() - before;
  const embed = new EmbedBuilder().setColor(COLORS.success)
    .setTitle(ctx.t('ping.title'))
    .addFields(
      { name: ctx.t('ping.ws'), value: ws ? `${ws}ms` : '—', inline: true },
      { name: ctx.t('ping.db'), value: `${dbMs}ms`, inline: true },
    );
  return ctx.reply({ embeds: [embed] }, { ephemeral: ctx.isSlash });
}

async function cmdUptime(ctx) {
  const embed = new EmbedBuilder().setColor(COLORS.primary)
    .setTitle(ctx.t('utility.uptime'))
    .setDescription(formatDuration(Date.now() - ctx.client.uptimeStart));
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdBotinfo(ctx) {
  const embed = new EmbedBuilder().setColor(COLORS.primary)
    .setTitle(ctx.t('utility.botInfo'))
    .setThumbnail(ctx.client.user.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: ctx.t('utility.servers'), value: String(ctx.client.guilds.cache.size), inline: true },
      { name: ctx.t('utility.users'), value: String(ctx.client.users.cache.size), inline: true },
      { name: ctx.t('utility.channels'), value: String(ctx.client.channels.cache.size), inline: true },
      { name: ctx.t('utility.commands'), value: String(ctx.loader?.all?.().length || 0), inline: true },
      { name: ctx.t('utility.memory'), value: `${Math.round(process.memoryUsage().heapUsed / 1048576)}MB` },
      { name: ctx.t('utility.node'), value: process.version },
      { name: ctx.t('utility.library'), value: 'discord.js' },
    );
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdAvatar(ctx) {
  const target = ctx.getUser('user', ctx.user);
  if (!target) return ctx.sendError('common.userNotFound', {}, {}, { ephemeral: true });
  const embed = new EmbedBuilder().setColor(COLORS.primary)
    .setTitle(ctx.t('utility.avatarTitle', { username: target.username }))
    .setImage(target.displayAvatarURL({ size: 1024, extension: 'png' }));
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdBanner(ctx) {
  const target = ctx.getUser('user', ctx.user);
  if (!target) return ctx.sendError('common.userNotFound', {}, {}, { ephemeral: true });
  const user = await ctx.client.users.fetch(target.id, { force: true }).catch(() => target);
  const banner = user.bannerURL({ size: 1024, extension: 'png' });
  if (!banner) return ctx.sendError('utility.noBanner', {}, {}, { ephemeral: true });
  const embed = new EmbedBuilder().setColor(COLORS.primary)
    .setTitle(ctx.t('utility.bannerTitle', { username: target.username }))
    .setImage(banner);
    return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdUserinfo(ctx) {
  const target = ctx.getUser('user', ctx.user) || ctx.user;
  if (!target) return ctx.sendError('common.userNotFound', {}, {}, { ephemeral: true });
  const member = ctx.guild ? ctx.guild.members.cache.get(target.id) : null;
  const embed = new EmbedBuilder().setColor(COLORS.primary)
    .setThumbnail(target.displayAvatarURL({ size: 128 }))
    .setTitle(ctx.t('utility.userinfoTitle'))
    .addFields(
      { name: 'Tag', value: target.tag || target.username },
      { name: ctx.t('utility.memberSince'), value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>` },
    );
  if (member) {
    embed.addFields({ name: ctx.t('utility.joinedServer'), value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` });
    const roles = [...(member.roles?.cache || [])].filter((r) => r.id !== ctx.guild.id);
    if (roles.length) embed.addFields({ name: ctx.t('utility.roles', { count: roles.length }), value: roles.slice(0, 15).map((r) => r.toString()).join(', ') || '—' });
  }
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdServerinfo(ctx) {
  const guild = ctx.guild;
  if (!guild) return ctx.sendError('common.guildOnly', {}, {}, { ephemeral: true });
  await guild.members.fetch();
  const roles = [...guild.roles.cache.values()].filter((r) => r.id !== guild.id);
  const embed = new EmbedBuilder().setColor(COLORS.primary)
    .setThumbnail(guild.icon ? guild.iconURL({ size: 128 }) : undefined)
    .setTitle(ctx.t('utility.serverinfoTitle'))
    .addFields(
      { name: ctx.t('utility.owner'), value: guild.members.cache.get(guild.ownerId)?.user.tag || guild.ownerId },
      { name: ctx.t('utility.created'), value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>` },
      { name: ctx.t('utility.members'), value: String(guild.memberCount), inline: true },
      { name: ctx.t('utility.boosts'), value: String(guild.premiumSubscriptionCount || 0), inline: true },
      { name: ctx.t('utility.textChannels'), value: String(guild.channels.cache.filter((c) => c.isTextBased()).size), inline: true },
      { name: ctx.t('utility.voiceChannels'), value: String(guild.channels.cache.filter((c) => c.isVoice()).size), inline: true },
      { name: ctx.t('utility.roles', { count: roles.length }), value: roles.length ? roles.map((r) => r.toString()).join(', ') : '—' },
    );
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdMembercount(ctx) {
  return ctx.reply({ content: ctx.t('utility.membercount', { count: ctx.guild?.memberCount || 0 }) });
}

async function cmdRoleinfo(ctx) {
  const role = ctx.getRole('role');
  if (!role) return ctx.sendError('common.invalidInput', { reason: 'role not found' }, {}, { ephemeral: true });
  const embed = new EmbedBuilder().setColor(role.color || COLORS.primary)
    .setTitle(ctx.t('utility.roleinfoTitle'))
    .setThumbnail(role.icon ? role.iconURL() : undefined)
    .addFields(
      { name: ctx.t('utility.role'), value: role.name },
      { name: ctx.t('utility.position'), value: String(role.position) },
      { name: ctx.t('utility.color'), value: role.hexColor },
      { name: ctx.t('utility.membersWithRole'), value: String(role.members?.size || 0) },
    );
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdChannelinfo(ctx) {
  const channel = ctx.getChannel('channel', ctx.channel);
  if (!channel) return ctx.sendError('common.invalidInput', { reason: 'channel not found' }, {}, { ephemeral: true });
  const embed = new EmbedBuilder().setColor(COLORS.primary)
    .setTitle(ctx.t('utility.channelinfoTitle'))
    .addFields(
      { name: 'ID', value: channel.id },
      { name: 'Type', value: channel.type },
    );
  if (channel.type === 'GUILD_TEXT') embed.addFields({ name: 'Topic', value: channel.topic || '—' });
  embed.addFields({ name: ctx.t('utility.nsfw'), value: channel.nsfw ? 'Yes' : 'No' });
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdEmoji(ctx) {
  const emojis = ctx.guild?.emojis?.cache || [];
  if (!emojis.size) return ctx.reply({ content: ctx.t('utility.empty') }, { ephemeral: true });
  const groups = [[], []];
  for (const e of emojis.values()) groups[e.animated ? 1 : 0].push(e.toString());
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle('😀 Emojis').addFields(
    { name: 'Static', value: groups[0].join(' ') || '—' },
    { name: 'Animated', value: groups[1].join(' ') || '—' },
  );
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdInvite(ctx) {
  const guild = ctx.guild;
  if (!guild) return ctx.sendError('common.guildOnly', {}, {}, { ephemeral: true });
  try {
    const channel = guild.systemChannel || guild.systemChannelCandidates?.[0]?.channel || (await guild.channels.fetch(guild.systemChannelId));
    const maxAge = ctx.getInt('max_age');
    const maxUses = ctx.getInt('max_uses');
    const invite = channel ? await channel.createInvite({ max_age: maxAge || 86400, max_uses: maxUses || null }) : null;
    return ctx.reply({ content: ctx.t('utility.invite') + (invite?.url ? `\n${invite.url}` : '') });
  } catch {
    return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  }
}

async function cmdPoll(ctx) {
  const question = ctx.getString('question');
  if (!question) return ctx.sendError('utility.pollNeedQuestion', {}, {}, { ephemeral: true });
  let optionsStr = ctx.getString('options', '');
  if (!optionsStr && ctx.message) {
    optionsStr = ctx.message.content.split(' ').slice(2).join(' ').split(';').join(';');
  }
  const options = String(optionsStr).split(';').map((s) => s.trim()).filter((s) => s).slice(0, LIMITS.pollMaxOptions);
  if (options.length < 2) return ctx.sendError('utility.pollNeedOptions', {}, {}, { ephemeral: true });
  const duration = ctx.getDuration('duration') || 24 * 60 * 60 * 1000;
  const anonymous = ctx.getBool('anonymous');
  const multi = ctx.getBool('multi');
  if (!ctx.guild || !ctx.channel?.isTextBased()) return ctx.sendError('common.guildOnly', {}, {}, { ephemeral: true });
  await pollService.create({ guild: ctx.guild, channel: ctx.channel, hostId: ctx.user.id, question, options, anonymous, multi, durationMs: duration });
  return ctx.sendSuccess('utility.pollCreated', { channel: ctx.channel.toString() }, {}, { ephemeral: true });
}

async function cmdRemind(ctx) {
  const durationStr = ctx.getString('duration');
  const duration = parseDuration(durationStr);
  if (!duration) return ctx.sendError('utility.remindInvalidDuration', {}, {}, { ephemeral: true });
  if (duration > LIMITS.remindMaxMs) return ctx.sendError('utility.remindTooLong', {}, {}, { ephemeral: true });
  const text = ctx.getString('text') || ctx.message?.content?.split(' ').slice(2).join(' ');
  if (!text) return ctx.sendError('utility.remindNeedText', {}, {}, { ephemeral: true });
  if (!ctx.guild || !ctx.channel) return ctx.sendError('common.guildOnly', {}, {}, { ephemeral: true });
  await reminderService.schedule(ctx.guildId, ctx.channel.id, ctx.user.id, text, duration);
    return ctx.sendSuccess('utility.remindSet', { duration: formatDuration(duration, ctx.t.bind(ctx)), text }, {}, { ephemeral: true });
}
