/**
 * /temprole — grant a role that expires automatically (spec §6 "Temporary roles").
 *
 * Duration parsing reuses ctx.getDuration (10s/5m/2h/3d/1w, same as /remind
 * and /timeout). Hierarchy is checked on both sides before granting.
 */
const { formatDuration } = require('../../utils/time');
const moderationService = require('../../services/moderationService');
const tempRoleService = require('../../services/tempRoleService');

function botCanManageRole(guild, role) {
  if (typeof role.manageable === 'boolean') return role.manageable;
  const me = guild.members.me;
  if (!me) return false; // cannot verify → fail safe
  if (guild.ownerId === me.id) return true;
  return role.position < me.roles.highest.position;
}

module.exports = {
  name: 'temprole',
  description: 'Grant a role that expires automatically',
  category: 'roles',
  usage: 'temprole <user> <role> <duration> [reason]',
  cooldown: { seconds: 3, scope: 'user' },
  permissions: { tier: 'admin', bot: ['ManageRoles'] },
  guildOnly: true,
  slash: true,
  options: [
    { name: 'user', type: 'member', description: 'Member to grant the role to', required: true },
    { name: 'role', type: 'role', description: 'Role to grant', required: true },
    { name: 'duration', type: 'string', description: 'e.g. 10m, 1h, 2d', required: true },
    { name: 'reason', type: 'string', description: 'Reason', required: false },
  ],
  subcommands: [
    {
      name: 'revoke', description: 'Remove a temporary role early',
      options: [
        { name: 'user', type: 'member', description: 'Member', required: true },
        { name: 'role', type: 'role', description: 'Role', required: true },
      ],
    },
    {
      name: 'list', description: 'List pending temporary roles in this server',
    },
  ],
  async run(ctx) {
    const sub = ctx.subcommand && ctx.subcommand.name;
    if (sub === 'revoke') return revoke(ctx);
    if (sub === 'list') return list(ctx);
    return grant(ctx);
  },
};

async function grant(ctx) {
  const target = ctx.getMember('user');
  const role = ctx.getRole('role');
  if (!target) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });
  if (!role) return ctx.sendError('roles.roleNotFound', {}, {}, { ephemeral: true });
  if (role.id === ctx.guild.id) return ctx.sendError('moderation.roleEveryone', {}, {}, { ephemeral: true });
  if (role.managed) return ctx.sendError('moderation.roleManaged', {}, {}, { ephemeral: true });

  const r = await moderationService.canModerate(ctx.member, target);
  if (!r.ok) return ctx.sendError(r.reason, {}, {}, { ephemeral: true });
  const botCheck = moderationService.botCanAct(ctx.guild, target);
  if (!botCheck.ok) return ctx.sendError(botCheck.reason, {}, {}, { ephemeral: true });
  if (!botCanManageRole(ctx.guild, role)) return ctx.sendError('moderation.roleHierarchyBot', {}, {}, { ephemeral: true });

  const ms = ctx.getDuration('duration');
  if (!ms) return ctx.sendError('roles.temproleInvalidDuration', {}, {}, { ephemeral: true });
  const reasonText = ctx.getString('reason', ctx.t('common.noReason'));

  try {
    await tempRoleService.grant(ctx.guild, target, role, ms, reasonText);
  } catch {
    return ctx.sendError('moderation.actionFailed', {}, {}, { ephemeral: true });
  }
  return ctx.sendSuccess('roles.temproleGranted', {
    role: role.name,
    user: target.user.tag,
    duration: formatDuration(ms, ctx.t.bind(ctx)),
  });
}

async function revoke(ctx) {
  const target = ctx.getMember('user');
  const role = ctx.getRole('role');
  if (!target) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });
  if (!role) return ctx.sendError('roles.roleNotFound', {}, {}, { ephemeral: true });
  const doc = await tempRoleService.revoke(ctx.guildId, target.id, role.id);
  if (!doc) return ctx.sendInfo('roles.temproleNone');
  return ctx.sendSuccess('roles.temproleRevoked', { role: role.name, user: target.user.tag });
}

async function list(ctx) {
  const docs = await tempRoleService.list(ctx.guildId);
  if (!docs.length) return ctx.sendInfo('roles.temproleEmpty');
  const lines = docs.map((d, i) => {
    const left = Math.max(0, (d.expiresAt || 0) - Date.now());
    const role = ctx.guild.roles.cache.get(d.roleId);
    return `${i + 1}. <@${d.userId}> — ${role ? role.name : d.roleId} (${formatDuration(left, ctx.t.bind(ctx))})`;
  }).slice(0, 20);
  return ctx.sendInfo('roles.temproleList', {}, { content: `⏳ Temp roles:\n${lines.join('\n')}` });
}
