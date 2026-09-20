/**
 * TempRoleService — temporary roles with expiry (spec §6 "Temporary roles").
 * Pure DB + setTimeout tracking in RAM; restore() re-arms timers on boot
 * (same pattern as giveaway and temp-role restores in src/events/ready.js).
 *
 * Collection `temproles` doc:
 *   { id, guildId, userId, roleId, expiresAt, reason }
 * where id = `${guildId}:${userId}:${roleId}`.
 */
const { getDatabase } = require('../database');
const logger = require('../utils/logger');

const COLLECTION = 'temproles';
const timers = new Map(); // id → Timeout
let client = null;

function setClient(c) { client = c; }
function collection() { return getDatabase().collection(COLLECTION); }

function idFor(guildId, userId, roleId) {
  return `${guildId}:${userId}:${roleId}`;
}

function clearTimer(id) {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
}

function schedule(id, delayMs) {
  clearTimer(id);
  const safe = Math.max(0, Math.min(delayMs, 0x7fffffff));
  const timer = setTimeout(() => expire(id).catch((e) => logger.error('temprole', `expire failed for ${id}: ${e.message}`)), safe);
  if (typeof timer.unref === 'function') timer.unref();
  timers.set(id, timer);
}

/** Grant a temporary role; re-granting the same triple refreshes the expiry. */
async function grant(guild, member, role, durationMs, reason) {
  if (!guild || !member || !role) throw new Error('missing-target');
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('invalid-duration');
  await member.roles.add(role, reason || 'Temporary role');
  const id = idFor(guild.id, member.id, role.id);
  const doc = { id, guildId: guild.id, userId: member.id, roleId: role.id, expiresAt: Date.now() + durationMs, reason: reason || null };
  await collection().set(id, doc);
  schedule(id, durationMs);
  return doc;
}

/** Remove early; returns the doc or null when nothing was pending. */
async function revoke(guildId, userId, roleId) {
  const id = idFor(guildId, userId, roleId);
  clearTimer(id);
  const doc = await collection().get(id);
  await collection().delete(id);
  if (doc && client) {
    const guild = client.guilds.cache.get(guildId);
    const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
    const role = guild ? guild.roles.cache.get(roleId) : null;
    if (member && role && member.roles.cache.has(roleId)) {
      await member.roles.remove(role, 'Temporary role expired (manual revoke)').catch(() => {});
    }
  }
  return doc;
}

async function list(guildId) {
  return collection().find((doc) => doc.guildId === String(guildId));
}

async function expire(id) {
  clearTimer(id);
  const doc = await collection().get(id);
  if (!doc) return;
  await collection().delete(id);
  if (!client) return;
  const guild = client.guilds.cache.get(doc.guildId);
  if (!guild) return; // bot left the guild — doc already cleaned up
  const member = await guild.members.fetch(doc.userId).catch(() => null);
  const role = guild.roles.cache.get(doc.roleId);
  if (member && role && member.roles.cache.has(doc.roleId)) {
    await member.roles.remove(role, 'Temporary role expired').catch(() => {});
  }
}

/** Re-arm all pending expiries (called from ready.js). */
async function restore(c) {
  if (c) client = c;
  const now = Date.now();
  const docs = await collection().all().catch(() => []);
  let rearmed = 0;
  for (const doc of docs) {
    if (!doc || !doc.id) continue;
    if (!client || !client.guilds.cache.has(doc.guildId)) {
      // Stale doc for a guild the bot no longer serves — same cleanup rule as automod_state.
      await collection().delete(doc.id).catch(() => {});
      continue;
    }
    const delay = (doc.expiresAt || 0) - now;
    if (delay <= 0) {
      await expire(doc.id);
    } else {
      schedule(doc.id, delay);
      rearmed++;
    }
  }
  logger.info('temprole', `Restore complete: ${rearmed} pending temp role(s) re-armed`);
  return rearmed;
}

module.exports = { setClient, grant, revoke, list, expire, restore };
