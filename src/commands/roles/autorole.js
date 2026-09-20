/**
 * /autorole — persistent auto-assign roles on member join (spec §6 "Auto Role").
 *
 * Welcome.autoroleIds trong guildConfigService là nguồn sự thật duy nhất.
 * welcomeService.assignAutoRoles() đọc chính field này trên guildMemberAdd,
 * nên lệnh này chỉ quản lý danh sách id (add/remove/list/clear). Check
 * hierarchy qua role.manageable, fail-safe khi bot member chưa cache.
 */
const guildConfigService = require('../../services/guildConfigService');
const welcomeService = require('../../services/welcomeService');

function botCanManageRole(guild, role) {
  if (typeof role.manageable === 'boolean') return role.manageable;
  const me = guild.members.me;
  if (!me) return false; // cannot verify → fail safe
  if (guild.ownerId === me.id) return true;
  return role.position < me.roles.highest.position;
}

module.exports = {
  name: 'autorole',
  description: 'Manage roles auto-assigned to new members',
  category: 'roles',
  usage: 'autorole <add|remove|list|clear>',
  cooldown: { seconds: 3, scope: 'user' },
  permissions: { tier: 'admin', bot: ['ManageRoles'] },
  guildOnly: true,
  slash: true,
  subcommands: [
    { name: 'add', description: 'Add a role to the auto-assign list', options: [{ name: 'role', type: 'role', description: 'Role to auto-assign', required: true }] },
    { name: 'remove', description: 'Remove a role from the auto-assign list', options: [{ name: 'role', type: 'role', description: 'Role to stop auto-assigning', required: true }] },
    { name: 'list', description: 'Show the current auto-assign list' },
    { name: 'clear', description: 'Clear all auto-assigned roles' },
  ],
  async run(ctx) {
    const sub = ctx.subcommand && ctx.subcommand.name;
    if (sub === 'add') return add(ctx);
    if (sub === 'remove') return remove(ctx);
    if (sub === 'list') return list(ctx);
    if (sub === 'clear') return clear(ctx);
    return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  },
};

async function currentIds(guildId) {
  const config = await guildConfigService.get(guildId);
  return Array.isArray(config.welcome.autoroleIds) ? [...config.welcome.autoroleIds] : [];
}

async function add(ctx) {
  const role = ctx.getRole('role');
  if (!role) return ctx.sendError('roles.roleNotFound', {}, {}, { ephemeral: true });
  if (role.id === ctx.guild.id) return ctx.sendError('moderation.roleEveryone', {}, {}, { ephemeral: true });
  if (role.managed) return ctx.sendError('moderation.roleManaged', {}, {}, { ephemeral: true });
  if (!botCanManageRole(ctx.guild, role)) return ctx.sendError('moderation.roleHierarchyBot', {}, {}, { ephemeral: true });

  const ids = await currentIds(ctx.guildId);
  if (ids.includes(role.id)) return ctx.sendInfo('roles.autoroleAlready', { role: role.name });
  ids.push(role.id);
  await guildConfigService.update(ctx.guildId, { 'welcome.autoroleIds': ids });
  return ctx.sendSuccess('roles.autoroleAdded', { role: role.name });
}

async function remove(ctx) {
  const role = ctx.getRole('role');
  if (!role) return ctx.sendError('roles.roleNotFound', {}, {}, { ephemeral: true });
  const ids = await currentIds(ctx.guildId);
  if (!ids.includes(role.id)) return ctx.sendInfo('roles.autoroleMissing', { role: role.name });
  await guildConfigService.update(ctx.guildId, { 'welcome.autoroleIds': ids.filter((id) => id !== role.id) });
  return ctx.sendSuccess('roles.autoroleRemoved', { role: role.name });
}

async function list(ctx) {
  const ids = await currentIds(ctx.guildId);
  if (!ids.length) return ctx.sendInfo('roles.autoroleEmpty');
  const lines = ids.map((id, i) => {
    const role = ctx.guild.roles.cache.get(id);
    return `${i + 1}. ${role ? `${role.name} (<@&${id}>)` : `⚠️ \`${id}\` (deleted?)`}`;
  });
  return ctx.sendInfo('roles.autoroleList', {}, { content: lines.join('\n').slice(0, 1900) });
}

async function clear(ctx) {
  const ids = await currentIds(ctx.guildId);
  if (!ids.length) return ctx.sendInfo('roles.autoroleEmpty');
  await guildConfigService.update(ctx.guildId, { 'welcome.autoroleIds': [] });
  return ctx.sendSuccess('roles.autoroleCleared', { count: String(ids.length) });
}

// Exported for the regression suite (no Discord round-trip needed).
module.exports._helpers = { botCanManageRole, currentIds };
