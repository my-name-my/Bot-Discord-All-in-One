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
const permissionService = require('./permissionService');
const i18n = require('./i18nService');
const logger = require('../utils/logger');

const messageLog = new Map(); // `${guildId}:${userId}` → [{ at, content }]
const joinLog = new Map(); // guildId → [timestamps]
const lockdownUntil = new Map(); // guildId → expiry

const INVITE_RE = /(?:discord\.(?:gg|io|me|li)|discord(?:app)?\.com\/invite)\/[\w-]+/i;
const LINK_RE = /https?:\/\/[^\s<]+/i;
const EMOJI_RE = /<a?:\w+:\d+>|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

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

  if (rules.antiMention.enabled && message.mentions.users.size > (rules.antiMention.maxMentions || 5)) {
    return { rule: 'antiMention', action: rules.antiMention.action };
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
      case 'warn':
        await warningService.addCase(message.guild.id, message.author.id, message.client.user.id, ruleText);
        await notify(message, t('automod.actions.warn', { violation: ruleText }));
        break;
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

/** Mass-join / raid detection — call from guildMemberAdd. */
async function handleJoin(member) {
  const config = await guildConfigService.get(member.guild.id);
  const rules = config.automod.rules;
  if (!config.automod.enabled || !rules.massJoin || !rules.massJoin.enabled) return false;

  const now = Date.now();
  const list = (joinLog.get(member.guild.id) || []).filter((ts) => now - ts < (rules.massJoin.windowSeconds || 60) * 1000);
  list.push(now);
  joinLog.set(member.guild.id, list);

  if (list.length > (rules.massJoin.maxJoins || 6) && !(lockdownUntil.get(member.guild.id) > now)) {
    lockdownUntil.set(member.guild.id, now + 5 * 60 * 1000);
    try {
      await member.guild.roles.everyone.setPermissions([], 'AutoMod raid lockdown');
      const channel = member.guild.systemChannel;
      if (channel) await channel.send({ content: i18n.translate(config.language, 'automod.lockdownOn') });
    } catch (error) {
      logger.error('automod', `lockdown failed: ${error.message}`);
    }
    await loggingService.sendLog(member.guild.id, 'moderation', {
      title: '🛡️ Raid protection',
      description: i18n.translate(config.language, 'automod.massJoin'),
    });
    return true;
  }
  return false;
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

module.exports = { handleMessage, handleJoin, detectViolation, isExempt };
