/**
 * /role — member role management (add/remove) + role lifecycle (create/delete).
 *
 * Hierarchy is always checked on BOTH sides: the executor (canModerate) and the
 * bot (botCanAct + botCanManageRole). Logging for create/delete is owned by the
 * roleCreate/roleDelete events (see src/events/README.md) to avoid duplicates.
 */
const moderationService = require('../../services/moderationService');

const COLOR_RE = /^#?[0-9a-fA-F]{6}$/;

module.exports = {
  name: 'role',
  description: 'Manage roles: add, remove, create, delete',
  category: 'moderation',
  usage: 'role <add|remove|create|delete> ...',
  cooldown: { seconds: 3, scope: 'user' },
  permissions: { tier: 'admin', bot: ['ManageRoles'] },
  guildOnly: true,
  slash: true,
  subcommands: [
    { name: 'add', description: 'Add a role to a member', options: [{ name: 'role', type: 'role', description: 'Role to add', required: true }, { name: 'user', type: 'member', description: 'Target member', required: true }, { name: 'reason', type: 'string', description: 'Reason', required: false }] },
    { name: 'remove', description: 'Remove a role from a member', options: [{ name: 'role', type: 'role', description: 'Role to remove', required: true }, { name: 'user', type: 'member', description: 'Target member', required: true }, { name: 'reason', type: 'string', description: 'Reason', required: false }] },
    { name: 'create', description: 'Create a new role', options: [{ name: 'name', type: 'string', description: 'Role name', required: true }, { name: 'color', type: 'string', description: 'Hex color, e.g. #ff0000', required: false }, { name: 'hoist', type: 'bool', description: 'Show separately in the member list', required: false }, { name: 'mentionable', type: 'bool', description: 'Allow anyone to mention it', required: false }] },
    { name: 'delete', description: 'Delete a role', options: [{ name: 'role', type: 'role', description: 'Role to delete', required: true }] },
  ],
  async run(ctx) {
    const action = ctx.subcommand && ctx.subcommand.name;
    if (action === 'create') return createRole(ctx);
    if (action === 'delete') return deleteRole(ctx);
    if (action === 'add' || action === 'remove') return toggleMemberRole(ctx, action);
    return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  },
};

/** True when the bot's highest role is above `role` (or the bot owns the guild). */
function botCanManageRole(ctx, role) {
  if (typeof role.manageable === 'boolean') return role.manageable;
  const me = ctx.guild.members.me;
  if (!me) return false; // cannot verify → fail safe
  if (ctx.guild.ownerId === me.id) return true;
  return role.position < me.roles.highest.position;
}

async function toggleMemberRole(ctx, action) {
  const target = ctx.getMember('user');
  const role = ctx.getRole('role');
  if (!role) return ctx.sendError('roles.roleNotFound', {}, {}, { ephemeral: true });
  if (!target) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });

  const r = await moderationService.canModerate(ctx.member, target);
  if (!r.ok) return ctx.sendError(r.reason, {}, {}, { ephemeral: true });
  // Reuse the service instead of the old inline check, which threw a TypeError
  // whenever guild.members.me was not cached.
  const botCheck = moderationService.botCanAct(ctx.guild, target);
  if (!botCheck.ok) return ctx.sendError(botCheck.reason, {}, {}, { ephemeral: true });
  if (!botCanManageRole(ctx, role)) return ctx.sendError('moderation.roleHierarchyBot', {}, {}, { ephemeral: true });

  const reasonText = ctx.getString('reason', ctx.t('common.noReason'));
  const hasRole = Boolean(target.roles && target.roles.cache && target.roles.cache.has(role.id));

  try {
    if (action === 'remove') {
      // Reporting "role removed" when nothing happened was misleading; this is
      // an informational outcome, not an error.
      if (!hasRole) return ctx.sendInfo('moderation.roleMissing', { user: target.user.tag, role: role.name });
      await target.roles.remove(role, reasonText);
      await moderationService.logAction(ctx.guildId, 'roles', {
        title: `🎭 Role removed: ${role.name}`,
        fields: [{ name: 'User', value: target.user.tag, inline: true }, { name: 'Moderator', value: ctx.user.tag, inline: true }],
        color: 0xfee75c,
      });
      return ctx.sendSuccess('moderation.roleRemoved', { user: target.user.tag, role: role.name });
    }

    if (hasRole) return ctx.sendInfo('moderation.roleAlready', { user: target.user.tag, role: role.name });
    await target.roles.add(role, reasonText);
    await moderationService.logAction(ctx.guildId, 'roles', {
      title: `🎭 Role added: ${role.name}`,
      fields: [{ name: 'User', value: target.user.tag, inline: true }, { name: 'Moderator', value: ctx.user.tag, inline: true }],
      color: 0x57f287,
    });
    return ctx.sendSuccess('moderation.roleAdded', { user: target.user.tag, role: role.name });
  } catch (error) {
    return ctx.sendError('moderation.actionFailed', {}, {}, { ephemeral: true });
  }
}

async function createRole(ctx) {
  const name = (ctx.getString('name') || '').trim();
  if (!name) return ctx.sendError('moderation.roleNameRequired', {}, {}, { ephemeral: true });

  const color = ctx.getString('color', null);
  if (color && !COLOR_RE.test(color.trim())) return ctx.sendError('moderation.invalidColor', {}, {}, { ephemeral: true });

  try {
    const role = await ctx.guild.roles.create({
      name: name.slice(0, 100),
      color: color ? color.trim() : undefined,
      hoist: ctx.getBool('hoist', false),
      mentionable: ctx.getBool('mentionable', false),
      reason: `Created by ${ctx.user.tag}`,
    });
    // The roleCreate event logs this with the audit-log executor — no duplicate log.
    return ctx.sendSuccess('moderation.roleCreated', { role: role.name });
  } catch (error) {
    return ctx.sendError('moderation.actionFailed', {}, {}, { ephemeral: true });
  }
}

async function deleteRole(ctx) {
  const role = ctx.getRole('role');
  if (!role) return ctx.sendError('roles.roleNotFound', {}, {}, { ephemeral: true });
  if (role.id === ctx.guild.id) return ctx.sendError('moderation.roleEveryone', {}, {}, { ephemeral: true });
  if (role.managed) return ctx.sendError('moderation.roleManaged', {}, {}, { ephemeral: true });
  if (!botCanManageRole(ctx, role)) return ctx.sendError('moderation.roleHierarchyBot', {}, {}, { ephemeral: true });

  try {
    await ctx.guild.roles.delete(role, `Deleted by ${ctx.user.tag}`);
    // The roleDelete event logs this — no duplicate log.
    return ctx.sendSuccess('moderation.roleDeleted', { role: role.name });
  } catch (error) {
    return ctx.sendError('moderation.actionFailed', {}, {}, { ephemeral: true });
  }
}
