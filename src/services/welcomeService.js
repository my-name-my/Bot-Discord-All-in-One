/**
 * WelcomeService — welcome/goodbye messages + auto role (spec §5).
 * Supports placeholders: {user} {username} {server} {memberCount} {mention}
 *
 * Logging trong service dùng titleKey/field nameKey để loggingService dịch
 * theo ngôn ngữ của guild (không hard-code title tiếng Việt ở đây).
 */
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const guildConfigService = require('./guildConfigService');
const loggingService = require('./loggingService');
const i18n = require('./i18nService');
const { applyPlaceholders } = require('../utils/placeholders');
const { COLORS } = require('../config/constants');

let client = null;
function setClient(c) {
  client = c;
}

/** Bot có quyền gửi tin vào kênh không? (check trước, khỏi spam lỗi). */
function canSendIn(channel) {
  try {
    const me = channel.guild && channel.guild.members ? channel.guild.members.me : null;
    const perms = me ? channel.permissionsFor(me) : null;
    if (!perms) return true; // không verify được (chưa cache) → thử gửi, lỗi thì bỏ qua
    return perms.has(PermissionFlagsBits.SendMessages)
      && perms.has(PermissionFlagsBits.ViewChannel)
      && (!channel.isThread() || perms.has(PermissionFlagsBits.SendMessagesInThreads));
  } catch {
    return true;
  }
}

/** Gửi tin, nuốt lỗi thiếu quyền / kênh đã xóa (event path không bao giờ throw). */
async function safeSend(channel, payload) {
  try {
    await channel.send(payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gán auto-role, bỏ qua role không gán được (xóa / hierarchy / thiếu quyền).
 * @returns {Promise<{ assigned: string[], skipped: string[] }>} tên role để log/test
 */
async function assignAutoRoles(member, roleIds) {
  const assigned = [];
  const skipped = [];
  if (!Array.isArray(roleIds) || !roleIds.length) return { assigned, skipped };
  for (const roleId of roleIds) {
    const role = member.guild.roles.cache.get(roleId);
    // Role đã bị xóa khỏi server nhưng config còn lưu id cũ → skip.
    if (!role) {
      skipped.push(roleId);
      continue;
    }
    // Role bot không quản lý được (cao hơn role bot / managed) → skip.
    if (typeof role.editable === 'boolean' && !role.editable) {
      skipped.push(role.name);
      continue;
    }
    try {
      await member.roles.add(role, 'Auto role');
      assigned.push(role.name);
    } catch {
      skipped.push(role.name);
    }
  }
  return { assigned, skipped };
}

function resolveWelcomeChannel(guild, config) {
  return guild.channels.cache.get(config.welcome.channelId) || null;
}

function resolveGoodbyeChannel(guild, config) {
  return guild.channels.cache.get(config.goodbye.channelId || config.welcome.channelId) || null;
}

function buildWelcomePayload(member, text, embedEnabled, language) {
  const payload = { content: text, allowedMentions: { parse: ['users'] } };
  if (embedEnabled) {
    const builder = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle(i18n.translate(language, 'welcome.welcomeTitle'))
      .setDescription(text)
      .setFooter({ text: `ID: ${member.id}` })
      .setTimestamp();
    const avatar = member.user && typeof member.user.displayAvatarURL === 'function'
      ? member.user.displayAvatarURL({ size: 128 })
      : null;
    if (avatar) builder.setThumbnail(avatar);
    payload.embeds = [builder];
    payload.content = undefined;
  }
  return payload;
}

function buildGoodbyePayload(text, embedEnabled, language) {
  const payload = { content: text, allowedMentions: { parse: [] } };
  if (embedEnabled) {
    payload.embeds = [
      new EmbedBuilder()
        .setColor(COLORS.neutral)
        .setTitle(i18n.translate(language, 'welcome.goodbyeTitle'))
        .setDescription(text)
        .setTimestamp(),
    ];
    payload.content = undefined;
  }
  return payload;
}

async function sendWelcome(member) {
  const guild = member.guild;
  const config = await guildConfigService.get(guild.id);

  // Auto-role chạy độc lập với welcome message: dù tắt message hay chưa đặt
  // kênh thì member mới vẫn được gán role (fail-soft từng role).
  const { assigned, skipped } = await assignAutoRoles(member, config.welcome.autoroleIds);
  if (skipped.length) {
    await loggingService.sendLog(guild.id, 'members', {
      titleKey: 'logging.events.autoroleSkipped',
      titleParams: { user: member.user ? member.user.tag : member.id },
      description: skipped.join(', ').slice(0, 4000),
      color: COLORS.warning,
    });
  }

  // Log join vào kênh log members — độc lập với welcome message (§4 + §5).
  try {
    await loggingService.sendLog(guild.id, 'members', {
      titleKey: 'logging.events.memberJoin',
      description: `${member.user ? member.user.tag : member.id} (${member.id})\nMember count: ${guild.memberCount}`,
      thumbnail: member.user && member.user.displayAvatarURL ? member.user.displayAvatarURL({ size: 128 }) : undefined,
      color: COLORS.success,
    });
  } catch { /* never throw from event path */ }

  if (!config.modules.welcome || !config.welcome.enabled) return;

  const channel = resolveWelcomeChannel(guild, config);
  if (!channel || !channel.isTextBased()) return;
  if (!canSendIn(channel)) return;

  const data = { user: member.user, guild };
  const text = applyPlaceholders(config.welcome.message, data);
  if (!text) return;

  const payload = buildWelcomePayload(member, text, config.welcome.embedEnabled, config.language);
  await safeSend(channel, payload);
}

async function sendGoodbye(member) {
  const guild = member.guild;
  const config = await guildConfigService.get(guild.id);

  // Log leave độc lập với goodbye message.
  try {
    await loggingService.sendLog(guild.id, 'members', {
      titleKey: 'logging.events.memberLeave',
      description: `${member.user ? member.user.tag : member.id} (${member.id})\nMember count: ${guild.memberCount}`,
      color: COLORS.warning,
    });
  } catch { /* never throw from event path */ }

  if (!config.modules.welcome || !config.goodbye.enabled) return;

  const channel = resolveGoodbyeChannel(guild, config);
  if (!channel || !channel.isTextBased()) return;
  if (!canSendIn(channel)) return;

  // Leave không cache user (partial): placeholder user/username render rỗng.
  const data = { user: member.user || null, guild };
  const text = applyPlaceholders(config.goodbye.message, data);
  if (!text) return;

  const payload = buildGoodbyePayload(text, config.goodbye.embedEnabled, config.language);
  await safeSend(channel, payload);
}

module.exports = {
  setClient,
  sendWelcome,
  sendGoodbye,
  // Export để test hồi quy:
  assignAutoRoles,
  resolveWelcomeChannel,
  resolveGoodbyeChannel,
  buildWelcomePayload,
  buildGoodbyePayload,
};
