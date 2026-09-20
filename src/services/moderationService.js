/**
 * ModerationService — shared, reusable moderation primitives: guild-member
 * hierarchy checks, the Discord actions themselves, and log emission.
 *
 * Every moderation command delegates the actual Discord call + logging here so
 * the rules (hierarchy, bot-perms, reason hygiene) live in exactly one place.
 */
const loggingService = require('./loggingService');
const warningService = require('./warningService');
const logger = require('../utils/logger');
const { PermissionFlagsBits } = require('discord.js');
const { COLORS, LIMITS } = require('../config/constants');

const REASON_MAX = 1000;
function reason(r) { return String(r || '').slice(0, REASON_MAX) || 'No reason'; }

function moderationIsOwner(m) { return m && m.guild && m.id === m.guild.ownerId; }

function targetTag(target) {
  if (!target) return 'unknown';
  if (target.user && target.user.tag) return target.user.tag;
  if (target.tag) return target.tag; // plain User (already left the guild)
  return target.id || 'unknown';
}

function targetId(target) {
  return (target.user || target).id;
}

function canModerate(moderator, target) {
  if (!moderator || !target) return { ok: false, reason: 'moderation.cantModerate' };
  if (moderator.id === targetId(target)) return { ok: false, reason: 'moderation.cantSelf' };
  if (moderationIsOwner(moderator)) return { ok: true };
  if (!moderator.roles || !moderator.roles.highest) return { ok: false, reason: 'moderation.cantModerate' };
  // A plain User (not a member anymore) has no roles → always below the moderator.
  if (target.roles && target.roles.highest && target.roles.highest.position >= moderator.roles.highest.position) {
    return { ok: false, reason: 'moderation.hierarchy' };
  }
  return { ok: true };
}

function botCanAct(guild, target) {
  if (!guild?.members?.me) return { ok: true };
  if (guild.ownerId === guild.members.me.id) return { ok: true };
  if (!target || (target.user && !target.roles)) return { ok: true }; // plain User — no role hierarchy applies
  if (!target.roles || !target.roles.highest) return { ok: false, reason: 'moderation.botHierarchy' };
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
    await guild.members.ban(targetId(target), { reason: reason(reasonText), deleteMessageSeconds: 0 });
    await logAction(guild.id, 'moderation', {
      title: `🔨 ${targetTag(target)} banned`, description: reason(reasonText),
      fields: [{ name: 'User', value: `${targetTag(target)} (<@${targetId(target)}>)`, inline: true }, { name: 'Moderator', value: moderator.user.tag, inline: true }],
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
/**
 * Bulk-delete recent messages.
 * Discord refuses to bulk-delete messages older than 14 days, so the number of
 * skipped (too old) messages is reported back to the caller (§4 transparency).
 */
async function bulkDelete(channel, count) {
  if (!channel || !channel.isTextBased()) return { ok: false, reason: 'moderation.invalidChannel' };
  const amount = Math.min(Math.max(1, Math.trunc(count)), LIMITS.purgeMax);
  const messages = await channel.messages.fetch({ limit: amount });
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const skipped = messages.filter((message) => message.createdTimestamp < cutoff).size;
  const deleted = await channel.bulkDelete(messages, true).catch(() => null);
  return { ok: true, deleted: deleted ? deleted.size : 0, skipped };
}

async function setLock(channel, locked, guild, reasonText) {
  if (!channel || !channel.isTextBased()) return { ok: false, reason: 'moderation.invalidChannel' };
  await channel.permissionOverwrites.edit(
    guild.id,
    { ViewChannel: true, SendMessages: locked ? false : null },
    { reason: reason(reasonText) === 'No reason' ? `Channel ${locked ? 'locked' : 'unlocked'}` : reason(reasonText) },
  );
  return { ok: true };
}

async function setSlowmode(channel, seconds) {
  if (!channel || !channel.isTextBased()) return { ok: false, reason: 'moderation.invalidChannel' };
  const clamped = Math.max(0, Math.min(Math.trunc(seconds), LIMITS.slowmodeMax));
  await channel.setRateLimitPerUser(clamped, 'Slowmode updated');
  return { ok: true, seconds: clamped };
}

// ── Warning escalation ladder (spec §3) ──────────────────────────────────────
/**
 * When a member's total warning count matches an entry in
 * `config.moderation.warnAutoPunish`, apply that punishment:
 *   { count: 3, action: 'timeout', durationMinutes: 60 }
 *   { count: 5, action: 'kick' }
 *   { count: 7, action: 'ban' }
 *
 * Shared by `/warn` and AutoMod so the ladder lives in exactly one place
 * (previously only AutoMod honoured it, so manual warnings never escalated).
 *
 * @param {Guild} guild
 * @param {GuildMember} member
 * @param {number} total warning count after this warning
 * @param {object} config guild config
 * @param {{ reason?: string }} [options]
 * @returns {Promise<{ action: 'timeout'|'kick'|'ban', minutes?: number }|null>}
 */
async function applyWarnEscalation(guild, member, total, config, options = {}) {
  const ladder = config && config.moderation && Array.isArray(config.moderation.warnAutoPunish)
    ? config.moderation.warnAutoPunish
    : [];
  const step = ladder.find((entry) => entry && Number(entry.count) === Number(total));
  if (!step || !member) return null;

  const reasonText = `${options.reason ? `${options.reason} — ` : ''}warning escalation (${total} warns)`;
  try {
    switch (String(step.action)) {
      case 'timeout': {
        if (!member.moderatable) return null;
        const minutes = Math.max(1, Number(step.durationMinutes) || 60);
        const ms = Math.min(minutes * 60 * 1000, LIMITS.timeoutMaxMs);
        await member.timeout(ms, reasonText);
        await logAction(guild.id, 'moderation', {
          title: `⏱️ Escalation: timeout (${total} warns)`,
          fields: [{ name: 'User', value: `${targetTag(member)} (<@${targetId(member)}>)`, inline: true }],
          color: COLORS.warning,
        });
        return { action: 'timeout', minutes };
      }
      case 'kick': {
        if (!member.kickable) return null;
        await member.kick(reasonText);
        await logAction(guild.id, 'moderation', {
          title: `👢 Escalation: kick (${total} warns)`,
          fields: [{ name: 'User', value: `${targetTag(member)} (<@${targetId(member)}>)`, inline: true }],
          color: COLORS.warning,
        });
        return { action: 'kick' };
      }
      case 'ban': {
        if (!member.bannable) return null;
        await member.ban({ reason: reasonText });
        await logAction(guild.id, 'moderation', {
          title: `🔨 Escalation: ban (${total} warns)`,
          fields: [{ name: 'User', value: `${targetTag(member)} (<@${targetId(member)}>)`, inline: true }],
          color: COLORS.error,
        });
        return { action: 'ban' };
      }
      default:
        return null;
    }
  } catch (error) {
    logger.error('moderation', `escalation ${step.action} failed: ${error.message}`);
    return null;
  }
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
  applyWarnEscalation,
  bulkDelete,
  setLock,
  setSlowmode,
};




