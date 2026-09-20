/**
 * /levelreward — quản lý phần thưởng role theo level (spec §6 "Level roles").
 *
 * Đọc/ghi `levels.roleRewards` trong guild config; levelService.applyRoleRewards
 * đọc chính field này khi member lên level. /levels addxp vẫn là chỗ cấp XP tay.
 */
const guildConfigService = require('../../services/guildConfigService');

function botCanManageRole(guild, role) {
  if (typeof role.manageable === 'boolean') return role.manageable;
  const me = guild.members.me;
  if (!me) return false; // cannot verify → fail safe
  if (guild.ownerId === me.id) return true;
  return role.position < me.roles.highest.position;
}

module.exports = {
  name: 'levelreward',
  description: 'Manage role rewards granted on level-up',
  category: 'roles',
  usage: 'levelreward <add|remove|list>',
  cooldown: { seconds: 3, scope: 'user' },
  permissions: { tier: 'admin', bot: ['ManageRoles'] },
  guildOnly: true,
  slash: true,
  subcommands: [
    { name: 'add', description: 'Grant a role when members reach a level', options: [{ name: 'level', type: 'int', description: 'Level number (≥ 1)', required: true }, { name: 'role', type: 'role', description: 'Role to grant', required: true }] },
    { name: 'remove', description: 'Remove the reward for a level', options: [{ name: 'level', type: 'int', description: 'Level number', required: true }] },
    { name: 'list', description: 'List all level rewards in this server' },
  ],
  async run(ctx) {
    const sub = ctx.subcommand && ctx.subcommand.name;
    if (sub === 'add') return add(ctx);
    if (sub === 'remove') return remove(ctx);
    if (sub === 'list') return list(ctx);
    return ctx.sendError('roles.levelrewardUsage', {}, {}, { ephemeral: true });
  },
};

async function currentRewards(guildId) {
  const config = await guildConfigService.get(guildId);
  return Array.isArray(config.levels.roleRewards) ? [...config.levels.roleRewards] : [];
}

async function add(ctx) {
  const level = ctx.getInt('level');
  const role = ctx.getRole('role');
  if (!Number.isInteger(level) || level < 1) return ctx.sendError('roles.rewardInvalidLevel', {}, {}, { ephemeral: true });
  if (!role) return ctx.sendError('roles.roleNotFound', {}, {}, { ephemeral: true });
  if (role.id === ctx.guild.id) return ctx.sendError('moderation.roleEveryone', {}, {}, { ephemeral: true });
  if (role.managed) return ctx.sendError('moderation.roleManaged', {}, {}, { ephemeral: true });
  if (!botCanManageRole(ctx.guild, role)) return ctx.sendError('moderation.roleHierarchyBot', {}, {}, { ephemeral: true });

  const rewards = await currentRewards(ctx.guildId);
  const idx = rewards.findIndex((r) => r.level === level);
  if (idx >= 0) rewards[idx] = { level, roleId: role.id };
  else rewards.push({ level, roleId: role.id });
  rewards.sort((a, b) => a.level - b.level);
  await guildConfigService.update(ctx.guildId, { 'levels.roleRewards': rewards });
  return ctx.sendSuccess('roles.rewardAdded', { level: String(level), role: role.name });
}

async function remove(ctx) {
  const level = ctx.getInt('level');
  if (!Number.isInteger(level) || level < 1) return ctx.sendError('roles.rewardInvalidLevel', {}, {}, { ephemeral: true });
  const rewards = await currentRewards(ctx.guildId);
  if (!rewards.some((r) => r.level === level)) return ctx.sendInfo('roles.rewardEmpty');
  await guildConfigService.update(ctx.guildId, { 'levels.roleRewards': rewards.filter((r) => r.level !== level) });
  return ctx.sendSuccess('roles.rewardRemoved', { level: String(level) });
}

async function list(ctx) {
  const rewards = await currentRewards(ctx.guildId);
  if (!rewards.length) return ctx.sendInfo('roles.rewardEmpty');
  const lines = rewards.map((r) => {
    const role = ctx.guild.roles.cache.get(r.roleId);
    return `Level ${r.level} → ${role ? `${role.name} (<@&${r.roleId}>)` : `⚠️ \`${r.roleId}\` (deleted?)`}`;
  });
  return ctx.sendInfo('roles.rewardList', {}, { content: lines.join('\n').slice(0, 1900) });
}

// Exported for the regression suite (no Discord round-trip needed).
module.exports._helpers = { botCanManageRole, currentRewards };
