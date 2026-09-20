/**
 * LevelService — XP per guild+user (`levels` collection).
 * XP curve: level = floor(sqrt(xp / 100)); xp for next = (level+1)^2 * 100.
 * XP is granted with a per-user cooldown and never for spam/bots/no-xp
 * channels or roles. Level role rewards are applied automatically and the
 * level-up is announced (config.levels.announceChannelId or the message
 * channel) using the guild language.
 */
const { EmbedBuilder } = require('discord.js');
const { getDatabase } = require('../database');
const guildConfigService = require('./guildConfigService');
const i18n = require('./i18nService');
const logger = require('../utils/logger');
const { XP, COLORS } = require('../config/constants');

const COLLECTION = 'levels';
const recentMessages = new Map(); // `${guildId}:${userId}` → last xp timestamp
const CLEANUP_THRESHOLD = 20_000;

function collection() {
  return getDatabase().collection(COLLECTION);
}

function key(guildId, userId) {
  return `${guildId}:${userId}`;
}

function levelForXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / XP.base));
}

function xpForLevel(level) {
  return level * level * XP.base;
}

async function getRecord(guildId, userId) {
  const doc = await collection().get(key(guildId, userId));
  return doc || { xp: 0, level: 0, lastXpAt: 0 };
}

async function setXp(guildId, userId, xp) {
  xp = Math.max(0, Math.trunc(xp));
  const level = levelForXp(xp);
  await collection().set(key(guildId, userId), { xp, level, lastXpAt: Date.now() });
  return { xp, level };
}

/**
 * Called on every (non-bot) message. Returns the level-up info when the
 * user crosses a level boundary, else null.
 */
async function handleMessage(message, client) {
  if (!message.guild || message.author.bot) return null;
  const guildId = message.guild.id;
  const userId = message.author.id;

  const config = await guildConfigService.get(guildId);
  if (!config.modules.levels) return null;

  // Channel / role exclusions
  if (Array.isArray(config.levels.noXpChannelIds) && config.levels.noXpChannelIds.includes(message.channel.id)) return null;
  if (Array.isArray(config.levels.noXpRoleIds) && config.levels.noXpRoleIds.length) {
    const roleIds = message.member ? [...message.member.roles.cache.keys()] : [];
    if (config.levels.noXpRoleIds.some((r) => roleIds.includes(r))) return null;
  }

  // Cooldown (anti-spam: no XP within the window)
  const recordKey = key(guildId, userId);
  const now = Date.now();
  const last = recentMessages.get(recordKey) || 0;
  const cooldownMs = Math.max(1, config.levels.cooldownSeconds || XP.defaultCooldownSeconds) * 1000;
  if (now - last < cooldownMs) return null;
  recentMessages.set(recordKey, now);
  if (recentMessages.size > 20_000) {
    for (const [k, ts] of recentMessages) {
      if (now - ts > cooldownMs * 2) recentMessages.delete(k);
    }
  }

  const amount = Math.floor(
    (XP.min + Math.random() * (XP.max - XP.min)) * (config.levels.multiplier || 1)
  );

  const before = await getRecord(guildId, userId);
  const beforeLevel = before.level || levelForXp(before.xp || 0);
  const { xp, level } = await setXp(guildId, userId, (before.xp || 0) + amount);

  if (level > beforeLevel) {
    await applyLevelUpSideEffects(message.guild, message.member, message.channel, level, config);
    return { guildId, userId, level, xp };
  }
  return null;
}

/**
 * Mọi hiệu ứng khi lên level (dùng chung cho cả XP từ tin nhắn lẫn admin
 * /levels addxp — spec §8: level up + level role rewards):
 *   1. Gán role reward đúng mốc level.
 *   2. Thông báo level-up vào announceChannelId (hoặc kênh hiện tại) —
 *      i18n theo ngôn ngữ guild, không hard-code chuỗi.
 * Never throws — hỏng perm/kênh chỉ bị bỏ qua, XP vẫn được cộng.
 */
async function applyLevelUpSideEffects(guild, member, fallbackChannel, level, config) {
  try {
    const rewards = await applyRoleRewards(guild, member, level, config);
    await announceLevelUp(guild, member, level, fallbackChannel, config, rewards);
  } catch (error) {
    logger.error('levels', `level-up side effects failed in ${guild ? guild.id : '?'}: ${error.message}`);
  }
}

async function applyRoleRewards(guild, member, level, config) {
  const granted = [];
  if (!member || !Array.isArray(config.levels.roleRewards)) return granted;
  for (const reward of config.levels.roleRewards) {
    if (reward.level !== level) continue;
    const role = guild.roles.cache.get(reward.roleId);
    if (!role || !member.roles.cache.has(reward.roleId)) {
      try {
        if (role) {
          await member.roles.add(role, 'Level reward');
          granted.push(role);
        }
      } catch { /* hierarchy/permission — ignore */ }
    }
  }
  return granted;
}

async function announceLevelUp(guild, member, level, fallbackChannel, config, rewards = []) {
  const lang = config.language;
  const channelId = config.levels.announceChannelId || (fallbackChannel ? fallbackChannel.id : null);
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return;
  const perms = channel.permissionsFor(guild.members.me);
  if (!perms || !perms.has('SendMessages')) return;

  const user = member ? member.user : null;
  const description = i18n.translate(lang, 'levels.levelUp', {
    mention: user ? user.toString() : level,
    level,
  });
  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setDescription(description)
    .setTimestamp();
  if (user) embed.setThumbnail(user.displayAvatarURL({ size: 128 }));
  // Role reward: mỗi reward là 1 dòng roleRewardEarned đã render i18n
  // (trước đây có biến lines tính rồi bỏ + format tự chế không qua i18n).
  if (rewards.length) {
    const rendered = rewards.slice(0, 5).map((role) =>
      i18n.translate(lang, 'levels.roleRewardEarned', { role: role.toString(), level })
    );
    embed.setDescription(`${description}\n${rendered.join('\n')}`);
  }
  await channel.send({ embeds: [embed], allowedMentions: { parse: ['users'] } });
}

/** Top N users by XP for a guild. */
async function leaderboard(guildId, limit = 10) {
  const rows = await collection().find((doc) => doc.guildId === guildId || String(doc.id || '').startsWith(`${guildId}:`));
  return rows
    .map((row) => ({
      userId: row.id ? row.id.split(':')[1] : row.userId,
      xp: row.xp || 0,
      level: row.level || levelForXp(row.xp || 0),
    }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

/** Admin: grant XP directly. */
async function addXp(guildId, userId, amount) {
  const before = await getRecord(guildId, userId);
  return setXp(guildId, userId, (before.xp || 0) + amount);
}

/**
 * Admin: cấp XP trực tiếp (VÀ vẫn áp dụng role reward + thông báo khi lên
 * level — trước đây đường admin bỏ qua cả hai, khác đường XP tự nhiên).
 * @param {Guild} guild
 * @param {GuildMember|null} member member đã fetch của người nhận
 * @param {number} amount
 */
async function grantXp(guild, member, amount) {
  const guildId = guild.id;
  const userId = member.user.id;
  const config = await guildConfigService.get(guildId);
  const beforeLevel = (await getRecord(guildId, userId)).level || levelForXp(0);
  const { xp, level } = await addXp(guildId, userId, amount);
  if (level > beforeLevel) {
    // Không có fallbackChannel từ context — resolve system channel hoặc kênh
    // text đầu tiên để level-up do admin cộng XP vẫn được thông báo.
    let fallbackChannel = null;
    if (!config.levels.announceChannelId) {
      fallbackChannel = guild.systemChannel
        || guild.channels.cache.find((c) => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('SendMessages'))
        || null;
    }
    await applyLevelUpSideEffects(guild, member, fallbackChannel, level, config);
  }
  return { xp, level };
}

module.exports = {
  handleMessage,
  getRecord,
  setXp,
  addXp,
  grantXp,
  leaderboard,
  levelForXp,
  xpForLevel,
  applyRoleRewards,
};
