/**
 * Default per-guild configuration.
 *
 * Every guild gets an isolated copy of this document (stored in the
 * `guilds` collection, keyed by guild id). Nothing here is global —
 * servers never share configuration state.
 */
const config = require('../config/config');
const { LIMITS, XP } = require('../config/constants');

const guildDefaults = {
  prefix: null, // null → falls back to config.defaultPrefix
  language: null, // null → falls back to config.defaultLanguage

  modules: {
    automod: false,
    logging: false,
    welcome: true,
    economy: true,
    levels: true,
    tickets: true,
    giveaways: true,
  },

  // Custom staff tiers: role ids per tier (checked by permissionService)
  roleTiers: {
    staff: [],
    mod: [],
    admin: [],
  },

  welcome: {
    enabled: true,
    channelId: null,
    message: 'Welcome {user} to {server}!\nYou are member #{memberCount}. 🎉',
    embedEnabled: true,
    autoroleIds: [],
  },

  goodbye: {
    enabled: true,
    channelId: null,
    message: '{username} has left {server}. 👋',
    embedEnabled: true,
  },

  logging: {
    enabled: true,
    defaultChannelId: null,
    categories: {
      moderation: null,
      members: null,
      messages: null,
      roles: null,
      channels: null,
      voice: null,
      errors: null,
    },
  },

  automod: {
    enabled: false,
    ignoredChannelIds: [],
    ignoredRoleIds: [],
    ignoredUserIds: [],
    punishments: {
      timeoutMinutes: 10,
      deleteMessage: true,
    },
    rules: {
      antiSpam: { enabled: true, maxMessages: 5, windowSeconds: 5, action: 'timeout' },
      antiDuplicate: { enabled: true, windowSeconds: 60, action: 'delete' },
      antiLink: { enabled: false, allowlist: ['discord.com', 'discord.gg'], action: 'delete' },
      antiInvite: { enabled: true, action: 'delete' },
      antiMention: { enabled: true, maxMentions: 5, action: 'warn' },
      badWords: { enabled: true, words: [], action: 'delete' },
      capsFilter: { enabled: false, minLength: 12, maxPercent: 70, action: 'delete' },
      emojiSpam: { enabled: true, maxEmojis: 10, action: 'delete' },
      massJoin: { enabled: true, maxJoins: 6, windowSeconds: 60, action: 'lockdown', lockdownMinutes: 5 },
    },
  },

  moderation: {
    warnAutoPunish: [
      // { count: 3, action: 'timeout', durationMinutes: 60 }
      // { count: 5, action: 'kick' }
      // { count: 7, action: 'ban' }
    ],
  },

  levels: {
    xpMin: XP.min,
    xpMax: XP.max,
    cooldownSeconds: XP.defaultCooldownSeconds,
    multiplier: 1,
    announceChannelId: null, // null → announce in the message channel
    noXpChannelIds: [],
    noXpRoleIds: [],
    roleRewards: [], // { level, roleId }
  },

  economy: {
    currencyName: 'coins',
    startingBalance: 100,
    dailyAmount: 500,
    workCooldownMinutes: 10,
    workMin: 50,
    workMax: 250,
    betMin: LIMITS.betMin,
    betMax: LIMITS.betMax,
    shop: [], // { id, name, price, description, roleId }
  },

  tickets: {
    enabled: true,
    panelChannelId: null,
    panelTitle: '🎫 Create Ticket',
    panelDescription: 'Select a ticket type below to open a private channel with our staff.',
    logsChannelId: null,
    types: [], // { id, label, emoji, categoryId, staffRoleIds }
  },

  giveaways: {
    managerRoleIds: [], // roles allowed to run /giveaway (besides tier: mod)
    pingRoleId: null, // role pinged when a giveaway starts
  },
};

module.exports = guildDefaults;
