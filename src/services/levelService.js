/**
 * LevelService — XP per guild+user (`levels` collection).
 * XP curve: level = floor(sqrt(xp / 100)); xp for next = (level+1)^2 * 100.
 * XP is granted with a per-user cooldown and never for spam/bots/no-xp
 * channels or roles. Level role rewards are applied automatically.
 */
const { getDatabase } = require('../database');
const guildConfigService = require('./guildConfigService');
const { clone } = require('../utils/objects');
const { XP } = require('../config/constants');

const COLLECTION = 'levels';
const recentMessages = new Map(); // `${guildId}:${userId}` → last xp timestamp

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
    await applyRoleRewards(message.guild, message.member, level, config);
    return { guildId, userId, level, xp };
  }
  return null;
}

async function applyRoleRewards(guild, member, level, config) {
  if (!member || !Array.isArray(config.levels.roleRewards)) return;
  for (const reward of config.levels.roleRewards) {
    if (reward.level !== level) continue;
    const role = guild.roles.cache.get(reward.roleId);
    if (!role || !member.roles.cache.has(reward.roleId)) {
      try {
        if (role) await member.roles.add(role, 'Level reward');
      } catch { /* hierarchy/permission — ignore */ }
    }
  }
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

module.exports = {
  handleMessage,
  getRecord,
  setXp,
  addXp,
  leaderboard,
  levelForXp,
  xpForLevel,
  applyRoleRewards,
};
