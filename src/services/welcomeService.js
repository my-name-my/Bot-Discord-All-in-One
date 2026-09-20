/**
 * WelcomeService — welcome/goodbye messages + auto role (spec §5).
 * Supports placeholders: {user} {username} {server} {memberCount} {mention}
 */
const { EmbedBuilder } = require('discord.js');
const guildConfigService = require('./guildConfigService');
const loggingService = require('./loggingService');
const { applyPlaceholders } = require('../utils/placeholders');
const { COLORS } = require('../config/constants');

let client = null;
function setClient(c) {
  client = c;
}

async function sendWelcome(member) {
  const config = await guildConfigService.get(member.guild.id);
  if (!config.modules.welcome || !config.welcome.enabled) return;

  // Auto role (respect hierarchy — only assignable roles)
  if (Array.isArray(config.welcome.autoroleIds) && config.welcome.autoroleIds.length) {
    for (const roleId of config.welcome.autoroleIds) {
      const role = member.guild.roles.cache.get(roleId);
      if (!role) continue;
      try {
        await member.roles.add(role, 'Auto role');
      } catch { /* hierarchy — skip silently */ }
    }
  }

  const channelId = config.welcome.channelId;
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return;

  const data = { user: member.user, guild: member.guild };
  const text = applyPlaceholders(config.welcome.message, data);
  if (!text) return;

  const payload = { content: text, allowedMentions: { parse: ['users'] } };
  if (config.welcome.embedEnabled) {
    payload.embeds = [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('👋 Chào mừng!')
        .setDescription(text)
        .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
        .setFooter({ text: `ID: ${member.id}` })
        .setTimestamp(),
    ];
    payload.content = undefined;
    payload.content2 = undefined;
  }

  try {
    await channel.send(payload);
  } catch { /* missing perms */ }

  await loggingService.sendLog(member.guild.id, 'members', {
    title: '📥 Member joined',
    description: `${member.user.tag} (${member.id})\nMember count: ${member.guild.memberCount}`,
    thumbnail: member.user.displayAvatarURL({ size: 128 }),
    color: COLORS.success,
  });
}

async function sendGoodbye(member) {
  const config = await guildConfigService.get(member.guild.id);
  if (!config.modules.welcome || !config.goodbye.enabled) return;

  const channelId = config.goodbye.channelId || config.welcome.channelId;
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return;

  const data = { user: member.user, guild: member.guild };
  const text = applyPlaceholders(config.goodbye.message, data);
  if (!text) return;

  const payload = { content: text, allowedMentions: { parse: [] } };
  if (config.goodbye.embedEnabled) {
    payload.embeds = [
      new EmbedBuilder()
        .setColor(COLORS.neutral)
        .setTitle('🚪 Tạm biệt!')
        .setDescription(text)
        .setTimestamp(),
    ];
    payload.content = undefined;
    payload.content2 = undefined;
  }

  try {
    await channel.send(payload);
  } catch { /* missing perms */ }

  await loggingService.sendLog(member.guild.id, 'members', {
    title: '📤 Member left',
    description: `${member.user ? member.user.tag : member.id} (${member.id})\nMember count: ${member.guild.memberCount}`,
    color: COLORS.warning,
  });
}

module.exports = { setClient, sendWelcome, sendGoodbye };
