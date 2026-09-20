/**
 * Tiered permission system.
 *
 * Tier ladder: member(0) < staff(1) < mod(2) < admin(3) < owner(4)
 * A member's tier is the highest of:
 *   - Discord permissions (Administrator → admin, Manage* → mod)
 *   - Roles listed in guildConfig.roleTiers.staff/mod/admin
 *   - Guild ownership (admin)
 *   - Bot owner (OWNER_IDS env) → owner
 *
 * Every command declares `permissions: { tier, bot: [...flags] }` and the
 * command handler enforces it before business logic runs.
 */
const { PermissionFlagsBits } = require('discord.js');
const config = require('../config/config');
const { PERMISSION_TIERS, TIER_NAMES } = require('../config/constants');

const MOD_PERMISSIONS = [
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageWebhooks,
];

const TIER_LOCALE_KEYS = {
  0: 'permissions.tierMember',
  1: 'permissions.tierStaff',
  2: 'permissions.tierMod',
  3: 'permissions.tierAdmin',
  4: 'permissions.tierOwner',
};

function tierFromDiscordPermissions(member) {
  if (!member || !member.guild) return PERMISSION_TIERS.member;
  if (member.id === member.guild.ownerId) return PERMISSION_TIERS.admin;
  const perms = member.permissions;
  if (perms && perms.has(PermissionFlagsBits.Administrator)) return PERMISSION_TIERS.admin;
  let tier = PERMISSION_TIERS.member;
  for (const perm of MOD_PERMISSIONS) {
    if (perms && perms.has(perm)) {
      tier = Math.max(tier, PERMISSION_TIERS.mod);
      break;
    }
  }
  return tier;
}

function tierFromRoles(member, guildConfig) {
  let tier = PERMISSION_TIERS.member;
  const roleIds = member && member.roles && member.roles.cache ? [...member.roles.cache.keys()] : [];
  const tiers = guildConfig && guildConfig.roleTiers ? guildConfig.roleTiers : {};
  const ladder = [
    ['admin', PERMISSION_TIERS.admin],
    ['mod', PERMISSION_TIERS.mod],
    ['staff', PERMISSION_TIERS.staff],
  ];
  for (const [key, value] of ladder) {
    if (Array.isArray(tiers[key]) && tiers[key].some((roleId) => roleIds.includes(roleId))) {
      tier = Math.max(tier, value);
    }
  }
  return tier;
}

/**
 * @param {object} params
 * @param {GuildMember|null} params.member
 * @param {string|null} params.userId
 * @param {object|null} params.guildConfig
 * @param {Client|null} params.client
 * @returns {number} tier value
 */
function getTier({ member, userId, guildConfig, client }) {
  if (userId && config.ownerIds.includes(userId)) return PERMISSION_TIERS.owner;
  if (member) {
    if (config.ownerIds.includes(member.id)) return PERMISSION_TIERS.owner;
    if (client && client.user && member.id === client.user.id) return PERMISSION_TIERS.owner;
    return Math.max(tierFromDiscordPermissions(member), tierFromRoles(member, guildConfig));
  }
  return PERMISSION_TIERS.member;
}

function tierName(tier, t = null) {
  if (t) return t(TIER_LOCALE_KEYS[tier] || TIER_LOCALE_KEYS[0]);
  return TIER_NAMES[tier] || String(tier);
}

/**
 * @returns {{ ok: boolean, tier: number, requiredTier?: number }}
 */
function checkPermission({ member, userId, guildConfig, client, requiredTier = 'member', t = null }) {
  const actual = getTier({ member, userId, guildConfig, client });
  const required = PERMISSION_TIERS[requiredTier] !== undefined ? PERMISSION_TIERS[requiredTier] : 0;
  if (actual >= required) return { ok: true, tier: actual };
  return { ok: false, tier: actual, requiredTier: required, requiredTierName: tierName(required, t) };
}

/** Human readable permission flag name: ManageMessages → Manage Messages */
function readablePermissionName(bitName) {
  return String(bitName)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

/**
 * Verify the BOT has the permissions a command needs.
 * @param {Guild|null} guild
 * @param {string[]} permissionNames e.g. ['BanMembers']
 */
function checkBotPermissions(guild, permissionNames) {
  if (!guild || !Array.isArray(permissionNames) || permissionNames.length === 0) {
    return { ok: true, missing: [] };
  }
  const me = guild.members && guild.members.me ? guild.members.me : null;
  if (!me) return { ok: true, missing: [] }; // cannot verify yet
  const missing = permissionNames.filter((name) => !me.permissions.has(PermissionFlagsBits[name]));
  return missing.length === 0 ? { ok: true, missing: [] } : { ok: false, missing };
}

module.exports = {
  getTier,
  tierName,
  checkPermission,
  checkBotPermissions,
  readablePermissionName,
  tierFromRoles,
  tierFromDiscordPermissions,
};
