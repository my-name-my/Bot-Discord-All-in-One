/**
 * ModerationService — shared, reusable moderation primitives: guild-member
 * hierarchy checks, the Discord actions themselves, and log emission.
 *
 * Every moderation command delegates the actual Discord call + logging here so
 * the rules (hierarchy, bot-perms, reason hygiene) live in exactly one place.
 */
const loggingService = require('./loggingService');
const warningService = require('./warningService');
const { PermissionFlagsBits } = require('discord.js');
const { COLORS, LIMITS } = require('../config/constants');

const REASON_MAX = 1000;
function reason(r) { return String(r || '').slice(0, REASON_MAX) || 'No reason'; }

function moderationIsOwner(m) { return m && m.guild && m.id === m.guild.ownerId; }

function canModerate(moderator, target) {
  if (!moderator || !target) return { ok: false, reason: 'moderation.cantModerate' };
  if (moderator.id === target.id) return { ok: false, reason: 'moderation.cantSelf' };
  if (moderationIsOwner(moderator)) return { ok: true };
  if (!moderator.roles || !target.roles) return { ok: false, reason: 'moderation.cantModerate' };
  if (target.roles.highest.position >= moderator.roles.highest.position) {
    return { ok: false, reason: 'moderation.hierarchy' };
  }
  return { ok: true };
}

function botCanAct(guild, target) {
  if (!guild?.members?.me) return { ok: true };
  if (guild.ownerId === guild.members.me.id) return { ok: true };
  if (!target || !target.roles) return { ok: false, reason: 'moderation.botHierarchy' };
  if (target.roles.highest.position >= guild.members.me.roles.highest.position) {
    return { ok: false, reason: 'moderation.botHierarchy' };
  }
  return { ok: true };
}

function logAction(guildId, category, payload) {
  return loggingService.sendLog(guildId, category, { color: COLORS.primary, ...payload });
}

async function ban(guild, moderator, target, reasonText) {
  let r = canModerate(moderator, target); if (!r.ok) return r;
  r = botCanAct(guild, target); if (!r.ok) return r;
  try {
    await guild.members.ban(target, { reason: reason(reasonText), deleteMessageSeconds: 0 });
    await logAction(guild.id, 'moderation', {
      title: `🔨 ${target.user.tag} banned`, description: reason(reasonText),
      fields: [{ name: 'User', value: `${target.user.tag} (<@${target.user.id}>)`, inline: true }, { name: 'Moderator', value: moderator.user.tag, inline: true }],
      color: COLORS.error,
    });
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'moderation.actionFailed', error: e.message }; }
}

async function kick(guild, moderator, target, reasonText) {
  let r = canModerate(moderator, target); if (!r.ok) return r;
  r = botCanAct(guild, target); if (!r.ok) return r;
  try {
    await target.kick(reason(reasonText));
    await logAction(guild.id, 'moderation', {
      title: `👢 ${target.user.tag} kicked`, description: reason(reasonText),
      fields: [{ name: 'User', value: `${target.user.tag} (<@${target.user.id}>)`, inline: true }, { name: 'Moderator', value: moderator.user.tag, inline: true }],
      color: COLORS.warning,
    });
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'moderation.actionFailed', error: e.message }; }
}

// ── Timeout ──────────────────────────────────────────────────────────────────
async function timeout(guild, moderator, target, ms, reasonText) {
  let r = canModerate(moderator, target); if (!r.ok) return r;
  r = botCanAct(guild, target); if (!r.ok) return r;
  const clamped = Math.max(1000, Math.min(ms, LIMITS.timeoutMaxMs));
  try {
    await target.timeout(clamped, reason(reasonText));
    const end = clamped >= LIMITS.timeoutMaxMs ? '∞' : `<t:${Math.floor((Date.now() + clamped) / 1000)}:R>`;
    await logAction(guild.id, 'moderation', {
      title: `⏱️ ${target.user.tag} timed out`, description: `Until ${end} — ${reason(reasonText)}`,
      fields: [{ name: 'User', value: `${target.user.tag} (<@${target.user.id}>)`, inline: true }, { name: 'Moderator', value: moderator.user.tag, inline: true }],
      color: COLORS.warning,
    });
    return { ok: true, until: clamped };
  } catch (e) { return { ok: false, reason: 'moderation.actionFailed', error: e.message }; }
}

async function removeTimeout(guild, moderator, target, reasonText) {
  let r = canModerate(moderator, target); if (!r.ok) return r;
  r = botCanAct(guild, target); if (!r.ok) return r;
  try {
    await target.timeout(null, reason(reasonText));
    await logAction(guild.id, 'moderation', {
      title: `✅ ${target.user.tag} untimed-out`, description: reason(reasonText),
      fields: [{ name: 'User', value: `${target.user.tag} (<@${target.user.id}>)`, inline: true }, { name: 'Moderator', value: moderator.user.tag, inline: true }],
      color: COLORS.success,
    });
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'moderation.actionFailed', error: e.message }; }
}

// ── Warnings ─────────────────────────────────────────────────────────────────
async function addWarning(guild, moderator, target, reasonText) {
  const r = await warningService.addCase(guild.id, target.id, moderator.id, reasonText);
  await logAction(guild.id, 'moderation', {
    title: `⚠️ ${target.user.tag} warned (case #${r.entry.number})`, description: reason(reasonText),
    fields: [{ name: 'User', value: `${target.user.tag} (<@${target.user.id}>)`, inline: true }, { name: 'Moderator', value: moderator.user.tag, inline: true }],
    color: COLORS.warning,
  });
  return { ok: true, number: r.entry.number, total: r.total };
}

async function removeWarning(guild, moderator, target, caseNumber) {
  const removed = await warningService.removeCase(guild.id, target.id, caseNumber);
  if (!removed) return { ok: false, reason: 'moderation.warningNotFound' };
  await logAction(guild.id, 'moderation', {
    title: '🗑️ warning removed', description: `Case #${caseNumber} for ${target.user.tag}`,
    fields: [{ name: 'Moderator', value: moderator.user.tag, inline: true }], color: COLORS.warning,
  });
  return { ok: true };
}

// ── Channel actions ─────────────────────────────────────────────────────────
async function bulkDelete(channel, count) {
  if (!channel || !channel.isTextBased()) return { ok: false, reason: 'moderation.invalidChannel' };
  const amount = Math.min(Math.max(1, Math.trunc(count)), LIMITS.purgeMax);
  const messages = await channel.messages.fetch({ limit: amount });
  const deleted = await channel.bulkDelete(messages, true).catch(() => null);
  return { ok: true, deleted: deleted ? deleted.size : 0 };
}

async function setLock(channel, locked, guild) {
  if (!channel || !channel.isTextBased()) return { ok: false, reason: 'moderation.invalidChannel' };
  await channel.permissionOverwrites.edit(
    guild.id,
    { ViewChannel: true, SendMessages: locked ? false : null },
    { reason: `Channel ${locked ? 'locked' : 'unlocked'}` },
  );
  return { ok: true };
}

async function setSlowmode(channel, seconds) {
  if (!channel || !channel.isTextBased()) return { ok: false, reason: 'moderation.invalidChannel' };
  const clamped = Math.max(0, Math.min(Math.trunc(seconds), LIMITS.slowmodeMax));
  await channel.setRateLimitPerUser(clamped, 'Slowmode updated');
  return { ok: true, seconds: clamped };
}

module.exports = {
  canModerate,
  botCanAct,
  reason,
  logAction,
  ban,
  kick,
  timeout,
  removeTimeout,
  addWarning,
  removeWarning,
  bulkDelete,
  setLock,
  setSlowmode,
};




