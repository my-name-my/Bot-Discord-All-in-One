/**
 * AutoModService — per-guild message moderation (spec §3).
 * Rules come from guildConfig.automod.rules; actions: delete/warn/
 * timeout/kick/ban. Staff (tier ≥ mod) and configured exempt channels,
 * roles and users are skipped.
 */
const { MessageFlags } = require('discord.js');
const guildConfigService = require('./guildConfigService');
const loggingService = require('./loggingService');
const warningService = require('./warningService');
const moderationService = require('./moderationService');
const permissionService = require('./permissionService');
const i18n = require('./i18nService');
const logger = require('../utils/logger');
const { getDatabase } = require('../database');
const { COLORS } = require('../config/constants');

const COLLECTION = 'automod_state'; // persisted raid-protection state (survives restarts)

/** Permissions restored when no snapshot was captured (e.g. lockdown from an older process). */
const DEFAULT_RESTORE = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'Connect', 'Speak'];

const messageLog = new Map(); // `${guildId}:${userId}` → [{ at, content }]
const joinLog = new Map(); // guildId → [timestamps]
const lockdownUntil = new Map(); // guildId → expiry
const lockdownTimers = new Map(); // guildId → auto-unlock timer

const INVITE_RE = /(?:discord\.(?:gg|io|me|li)|discord(?:app)?\.com\/invite)\/[\w-]+/i;
const LINK_RE = /https?:\/\/[^\s<]+/i;
const EMOJI_RE = /<a?:\w+:\d+>|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

const TRACK_MAX_WINDOW_MS = 5 * 60 * 1000; // never keep history older than 5 min
const TRACK_MAX_PER_USER = 50; // hard cap → bounded memory
const TRACK_MAX_KEYS = 5000;

/**
 * Record a message for the sliding-window rules (anti-spam / anti-duplicate).
 * Returns the (pruned) history for this author, newest last.
 * Every entry older than the largest configurable window is dropped so a
 * busy server cannot grow this Map without bound.
 */
function trackMessage(message) {
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const history = messageLog.get(key) || [];
  const kept = history.filter((entry) => now - entry.at < TRACK_MAX_WINDOW_MS);
  kept.push({ at: now, content: message.content || '' });
  messageLog.set(key, kept.slice(-TRACK_MAX_PER_USER));
  if (messageLog.size > TRACK_MAX_KEYS) pruneMessageLog(now);
  return messageLog.get(key);
}

function pruneMessageLog(now = Date.now()) {
  for (const [key, history] of messageLog) {
    if (!history.length || now - history[history.length - 1].at > TRACK_MAX_WINDOW_MS) {
      messageLog.delete(key);
    }
  }
}

// ── Raid-protection persistence ─────────────────────────────────────────────
// A lockdown strips @everyone's permissions, so it MUST be recoverable after a
// crash/restart: the auto-unlock timer only lives in memory, so both the
// deadline and the captured permission snapshot are written to the database.

function stateCollection() {
  return getDatabase().collection(COLLECTION);
}

/** Read persisted state for a guild — never throws (a missing DB must not break moderation). */
async function readState(guildId) {
  try {
    return (await stateCollection().get(guildId)) || {};
  } catch {
    return {};
  }
}

/**
 * Persist raid-protection state.
 * @returns {Promise<'ok'|'unavailable'|'failed'>} `unavailable` = no database
 *   (unit tests / pre-boot), `failed` = a real storage error. The distinction
 *   matters: a lockdown whose snapshot cannot be stored must be aborted.
 */
async function writeState(guildId, patch) {
  try {
    const stored = (await stateCollection().get(guildId)) || {};
    await stateCollection().set(guildId, { ...stored, ...patch });
    return 'ok';
  } catch (error) {
    if (/not initialized/i.test(String(error.message))) return 'unavailable';
    logger.error('automod', `state persist failed for ${guildId}: ${error.message}`);
    return 'failed';
  }
}

function isExempt(message, config) {
  if (message.member && permissionService.getTier({
    member: message.member,
    userId: message.author.id,
    guildConfig: config,
    client: message.client,
  }) >= 2) return true; // mods and above bypass
  if (Array.isArray(config.automod.ignoredChannelIds) && config.automod.ignoredChannelIds.includes(message.channel.id)) return true;
  if (Array.isArray(config.automod.ignoredUserIds) && config.automod.ignoredUserIds.includes(message.author.id)) return true;
  if (Array.isArray(config.automod.ignoredRoleIds) && config.automod.ignoredRoleIds.length && message.member) {
    const roleIds = [...message.member.roles.cache.keys()];
    if (config.automod.ignoredRoleIds.some((r) => roleIds.includes(r))) return true;
  }
  return false;
}

function detectViolation(message, config) {
  const rules = config.automod.rules;
  const content = message.content || '';
  const tracked = trackMessage(message);

  if (rules.antiSpam.enabled) {
    const windowMs = (rules.antiSpam.windowSeconds || 5) * 1000;
    const recent = tracked.filter((m) => Date.now() - m.at < windowMs);
    if (recent.length > (rules.antiSpam.maxMessages || 5)) {
      return { rule: 'antiSpam', action: rules.antiSpam.action };
    }
  }

  if (rules.antiDuplicate.enabled) {
    const windowMs = (rules.antiDuplicate.windowSeconds || 60) * 1000;
    const same = tracked.filter((m) => m.content === content && Date.now() - m.at < windowMs);
    if (same.length >= 3 && content.length > 0) {
      return { rule: 'antiDuplicate', action: rules.antiDuplicate.action };
    }
  }

  if (rules.antiInvite.enabled && INVITE_RE.test(content)) {
    return { rule: 'antiInvite', action: rules.antiInvite.action };
  }

  if (rules.antiLink.enabled && LINK_RE.test(content)) {
    const allowlist = rules.antiLink.allowlist || [];
    const urls = content.match(LINK_RE) || [];
    const violates = urls.some((url) => {
      try {
        const host = new URL(url).hostname.toLowerCase();
        return !allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
      } catch {
        return true;
      }
    });
    if (violates) return { rule: 'antiLink', action: rules.antiLink.action };
  }

  if (rules.antiMention.enabled) {
    // Count user AND role pings: role-mention spam was previously invisible.
    const mentions = message.mentions || {};
    const userMentions = mentions.users ? mentions.users.size : 0;
    const roleMentions = mentions.roles ? mentions.roles.size : 0;
    if (userMentions + roleMentions > (rules.antiMention.maxMentions || 5)) {
      return { rule: 'antiMention', action: rules.antiMention.action };
    }
  }

  if (rules.badWords.enabled && Array.isArray(rules.badWords.words) && rules.badWords.words.length) {
    const lower = content.toLowerCase();
    const hit = rules.badWords.words.find((word) => word && lower.includes(String(word).toLowerCase()));
    if (hit) return { rule: 'badWords', action: rules.badWords.action };
  }

  if (rules.capsFilter.enabled && content.length >= (rules.capsFilter.minLength || 12)) {
    const letters = content.replace(/[^a-zA-Z]/g, '');
    if (letters.length >= (rules.capsFilter.minLength || 12)) {
      const caps = letters.replace(/[^A-Z]/g, '').length;
      if ((caps / letters.length) * 100 > (rules.capsFilter.maxPercent || 70)) {
        return { rule: 'capsFilter', action: rules.capsFilter.action };
      }
    }
  }

  if (rules.emojiSpam.enabled) {
    const emojis = content.match(EMOJI_RE);
    if (emojis && emojis.length > (rules.emojiSpam.maxEmojis || 10)) {
      return { rule: 'emojiSpam', action: rules.emojiSpam.action };
    }
  }

  return null;
}

async function applyAction(message, violation, config) {
  const { rule, action } = violation;
  const member = message.member;
  const t = (key, params) => i18n.translate(config.language, key, params);
  const ruleText = t(`automod.violations.${rule}`);

  try {
    if (config.automod.punishments.deleteMessage !== false) {
      await message.delete().catch(() => {});
    }
  } catch { /* may already be gone */ }

  try {
    switch (action) {
      case 'warn': {
        const added = await warningService.addCase(message.guild.id, message.author.id, message.client.user.id, ruleText);
        await notify(message, t('automod.actions.warn', { violation: ruleText }));
        await escalateWarnings(message, member, added.total, config, t, ruleText);
        break;
      }
      case 'timeout': {
        if (member && member.moderatable) {
          const ms = Math.min((config.automod.punishments.timeoutMinutes || 10) * 60 * 1000, 28 * 24 * 60 * 60 * 1000);
          await member.timeout(ms, `AutoMod: ${rule}`);
          await notify(message, t('automod.actions.timeout', { duration: t('time.minutes', { count: Math.round(ms / 60000) }), violation: ruleText }));
        } else {
          await notify(message, t('automod.actions.delete', { violation: ruleText }));
        }
        break;
      }
      case 'kick':
        if (member && member.kickable) await member.kick(`AutoMod: ${rule}`);
        break;
      case 'ban':
        if (member && member.bannable) await member.ban({ reason: `AutoMod: ${rule}` });
        break;
      case 'delete':
      default:
        await notify(message, t('automod.actions.delete', { violation: ruleText }));
    }
  } catch (error) {
    logger.error('automod', `action ${action} failed: ${error.message}`);
  }

  await loggingService.sendLog(message.guild.id, 'moderation', {
    title: `🛡️ AutoMod: ${ruleText}`,
    description: `**User:** ${message.author.tag} (${message.author.id})\n**Channel:** ${message.channel}\n**Action:** ${action}`,
  });
}

async function notify(message, text) {
  try {
    await message.channel.send({
      content: `<@${message.author.id}> ${text}`,
      flags: MessageFlags.SuppressEmbeds,
      allowedMentions: { users: [message.author.id] },
    });
  } catch { /* channel may be gone */ }
}

/**
 * Configurable severity ladder (spec §3) — delegated to moderationService so
 * `/warn` and AutoMod share one implementation. This wrapper only turns the
 * result into an in-channel notice for the punished member.
 */
async function escalateWarnings(message, member, total, config, t, ruleText) {
  const escalation = await moderationService.applyWarnEscalation(
    message.guild,
    member,
    total,
    config,
    { reason: `AutoMod: ${ruleText}` },
  );
  if (!escalation) return null;

  const params = { violation: ruleText };
  if (escalation.minutes) params.duration = t('time.minutes', { count: escalation.minutes });
  await notify(message, t(`automod.actions.${escalation.action}`, params));
  return escalation.action;
}

/**
 * Mass-join / raid detection — call from guildMemberAdd.
 * The response is configurable via rules.massJoin.action:
 *   'lockdown' (default) → strip @everyone, auto-restore after lockdownMinutes
 *   anything else        → staff alert only, no permission is touched
 * Join timestamps are persisted so the detection window survives a restart.
 * @returns {Promise<boolean>} true when the configured action fired
 */
async function handleJoin(member) {
  const config = await guildConfigService.get(member.guild.id);
  const rules = config.automod.rules;
  if (!config.automod.enabled || !rules.massJoin || !rules.massJoin.enabled) return false;

  const guildId = member.guild.id;
  const now = Date.now();
  const windowMs = (rules.massJoin.windowSeconds || 60) * 1000;

  // Prefer the in-memory window, but fall back to the persisted one so a
  // restart mid-raid does not reset the counter to zero.
  let list = joinLog.get(guildId);
  if (!Array.isArray(list)) list = (await readState(guildId)).joins || [];
  list = list.filter((ts) => now - Number(ts) < windowMs);
  list.push(now);
  joinLog.set(guildId, list);
  await writeState(guildId, { joins: list.slice(-TRACK_MAX_PER_USER) });

  if (list.length <= (rules.massJoin.maxJoins || 6)) return false;

  const action = rules.massJoin.action || 'lockdown';
  if (action !== 'lockdown') {
    await loggingService.sendLog(guildId, 'moderation', {
      title: '🛡️ Raid protection (alert only)',
      description: `${list.length} members joined within ${Math.round(windowMs / 1000)}s.\nConfigured action: **${action}** — no permissions were changed.`,
      color: COLORS.warning,
    });
    return true;
  }

  const until = lockdownUntil.get(guildId) || 0;
  if (until > now) return false; // a lockdown is already running

  const minutes = Math.max(1, Number(rules.massJoin.lockdownMinutes) || 5);
  await lockDown(member.guild, config, minutes);
  return true;
}

/**
 * Temporarily strip @everyone's permissions and schedule an automatic
 * restore. The previous permission set is saved first so we never wipe a
 * server's configuration permanently.
 */
async function lockDown(guild, config, minutes) {
  const everyone = guild.roles.everyone;
  const previous = everyonesPermissions(everyone);
  const until = Date.now() + Math.max(1, Number(minutes) || 5) * 60 * 1000;

  // Persist FIRST. A lockdown whose snapshot is not on disk cannot be undone
  // after a restart, so a storage failure aborts the lockdown instead of
  // leaving the server's @everyone permissions stripped forever.
  const persisted = await writeState(guild.id, { lockdown: { until, previous } });
  if (persisted === 'failed') {
    logger.error('automod', `lockdown ABORTED for ${guild.id}: permission snapshot could not be persisted`);
    await loggingService.sendLog(guild.id, 'moderation', {
      title: '🛡️ Raid detected — lockdown SKIPPED',
      description: 'The @everyone permission snapshot could not be saved, so the lockdown was aborted to avoid an unrecoverable wipe. Check the database connection.',
      color: COLORS.error,
    });
    return { ok: false, reason: 'state-not-persisted' };
  }

  lockdownUntil.set(guild.id, until);
  try {
    await everyone.setPermissions([], 'AutoMod raid lockdown');
    const channel = guild.systemChannel;
    if (channel) await channel.send({ content: i18n.translate(config.language, 'automod.lockdownOn') }).catch(() => {});
  } catch (error) {
    logger.error('automod', `lockdown failed: ${error.message}`);
  }
  await loggingService.sendLog(guild.id, 'moderation', {
    title: '🛡️ Raid protection',
    description: `${i18n.translate(config.language, 'automod.massJoin')}\nAuto-unlock in ${minutes} min.`,
    color: COLORS.error,
  });

  const timer = setTimeout(() => {
    unlockDown(guild, previous).catch((error) => logger.error('automod', `auto-unlock failed: ${error.message}`));
  }, Math.max(1000, until - Date.now()));
  if (typeof timer.unref === 'function') timer.unref();
  lockdownTimers.set(guild.id, timer);
  return { ok: true };
}

function everyonesPermissions(role) {
  try {
    return role.permissions.toArray();
  } catch {
    return [];
  }
}

/**
 * Restore @everyone permissions captured by lockDown().
 * @param {Guild} guild
 * @param {string[]} [previous] snapshot kept by the caller; when omitted (the
 *   restart path) the snapshot persisted at lockdown time is used instead.
 */
async function unlockDown(guild, previous) {
  const timer = lockdownTimers.get(guild.id);
  if (timer) {
    clearTimeout(timer);
    lockdownTimers.delete(guild.id);
  }
  lockdownUntil.delete(guild.id);

  let snapshot = Array.isArray(previous) && previous.length ? previous : null;
  if (!snapshot) {
    const state = await readState(guild.id);
    if (state.lockdown && Array.isArray(state.lockdown.previous) && state.lockdown.previous.length) {
      snapshot = state.lockdown.previous;
    }
  }

  let restored = false;
  try {
    const role = guild.roles.everyone;
    await role.setPermissions(snapshot || DEFAULT_RESTORE, 'AutoMod raid lockdown lifted');
    restored = true;
  } catch (error) {
    logger.error('automod', `unlock failed: ${error.message}`);
  }

  // Announce + audit must never depend on the config lookup succeeding:
  // a DB hiccup here previously swallowed the whole unlock notification.
  let language = null;
  try {
    const config = await guildConfigService.get(guild.id);
    language = config.language;
  } catch (error) {
    logger.error('automod', `unlock announce: config unavailable (${error.message})`);
  }

  try {
    const channel = guild.systemChannel;
    if (channel) await channel.send({ content: i18n.translate(language, 'automod.lockdownOff') }).catch(() => {});
  } catch (error) {
    logger.error('automod', `unlock announce failed: ${error.message}`);
  }

  await loggingService.sendLog(guild.id, 'moderation', {
    title: '🔓 Raid lockdown lifted',
    description: restored ? '@everyone permissions restored.' : 'Permission restore failed — check the bot role hierarchy.',
    color: restored ? COLORS.success : COLORS.error,
  }).catch(() => {});

  // The lockdown is over → drop the persisted snapshot so a later restart
  // never re-applies a stale lockdown.
  await writeState(guild.id, { lockdown: null });

  return restored ? { ok: true } : { ok: false };
}

/**
 * Re-arm raid protection after a bot restart (spec §27: restart resilience).
 * Without this, a lockdown that was active when the process died would leave
 * @everyone stripped forever, because the auto-unlock timer lived in memory.
 * Call once from events/ready.js with the ready client.
 * @returns {Promise<{ rearmed: number, unlocked: number }>}
 */
async function restore(client) {
  const result = { rearmed: 0, unlocked: 0 };

  let docs;
  try {
    docs = await stateCollection().all();
  } catch (error) {
    logger.error('automod', `restore: cannot read state (${error.message})`);
    return result;
  }

  const now = Date.now();
  for (const doc of docs || []) {
    const guildId = String(doc.id || '');
    if (!guildId) continue;

    // Rehydrate the join window so a raid in progress keeps counting.
    if (Array.isArray(doc.joins) && doc.joins.length) {
      joinLog.set(guildId, doc.joins.filter((ts) => now - Number(ts) < TRACK_MAX_WINDOW_MS));
    }

    const lockdown = doc.lockdown;
    if (!lockdown) continue;

    const guild = client && client.guilds ? client.guilds.cache.get(guildId) : null;
    if (!guild) {
      // Bot is no longer in that guild — nothing to restore, forget the state.
      await writeState(guildId, { lockdown: null });
      continue;
    }

    const until = Number(lockdown.until) || 0;
    if (until <= now) {
      await unlockDown(guild, lockdown.previous);
      result.unlocked++;
      continue;
    }

    lockdownUntil.set(guildId, until);
    const timer = setTimeout(() => {
      unlockDown(guild, lockdown.previous).catch((error) => logger.error('automod', `auto-unlock failed: ${error.message}`));
    }, until - now);
    if (typeof timer.unref === 'function') timer.unref();
    lockdownTimers.set(guildId, timer);
    result.rearmed++;
    logger.warn('automod', `Re-armed lockdown for ${guildId} (${Math.ceil((until - now) / 1000)}s left)`);
  }

  if (result.rearmed || result.unlocked) {
    logger.info('automod', `restore: ${result.rearmed} re-armed, ${result.unlocked} unlocked after restart`);
  }
  return result;
}

/** Entry point from messageCreate. Returns true when the message was handled. */
async function handleMessage(message, ctx) {
  if (!message.guild || message.author.bot) return false;
  const config = ctx.guildConfig || await guildConfigService.get(message.guild.id);
  if (!config.automod.enabled) return false;
  if (isExempt(message, config)) return false;

  const violation = detectViolation(message, config);
  if (!violation) return false;

  await applyAction(message, violation, config);
  return true;
}

module.exports = {
  handleMessage,
  handleJoin,
  detectViolation,
  isExempt,
  trackMessage,
  lockDown,
  unlockDown,
  restore,
};
