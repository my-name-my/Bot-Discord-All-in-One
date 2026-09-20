/**
 * Audit-log attribution helper.
 *
 * Discord does not tell event listeners who performed an action, so change
 * logs (nickname, role, channel) read it from the guild audit log. The entry
 * is only trusted when it targets the expected object and was written within
 * a short window — otherwise a stale entry would blame the wrong moderator.
 */
const { AuditLogEvent } = require('discord.js');
const logger = require('./logger');

const DEFAULT_TOLERANCE_MS = 15000;
// Discord writes the audit entry a moment after the event fires. The wait is
// configurable so test suites can run instantly (`AUDIT_LOG_DELAY_MS=0`).
const configuredDelay = Number(process.env.AUDIT_LOG_DELAY_MS);
const DEFAULT_DELAY_MS = Number.isFinite(configuredDelay) && configuredDelay >= 0 ? configuredDelay : 800;

/**
 * @param {Guild} guild
 * @param {number} type AuditLogEvent value
 * @param {string} targetId id of the affected role/channel/user
 * @param {{ toleranceMs?: number, delayMs?: number }} [options]
 * @returns {Promise<{ id: string, tag: string }|null>} executor or null
 */
async function findExecutor(guild, type, targetId, options = {}) {
  const tolerance = options.toleranceMs || DEFAULT_TOLERANCE_MS;
  const delay = options.delayMs === undefined ? DEFAULT_DELAY_MS : options.delayMs;
  if (!guild || typeof guild.fetchAuditLogs !== 'function') return null;

  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 });
    const entry = logs.entries.find((e) => {
      if (!e.target || String(e.target.id) !== String(targetId)) return false;
      return Date.now() - e.createdTimestamp <= tolerance;
    });
    if (!entry) return null;
    const executor = entry.executor;
    return { id: entry.executorId, tag: executor ? executor.tag : entry.executorId };
  } catch (error) {
    // Missing ViewAuditLog permission is normal on locked-down servers.
    logger.warn('audit', `fetchAuditLogs(${type}) failed: ${error.message}`);
    return null;
  }
}

module.exports = { findExecutor, AuditLogEvent };
