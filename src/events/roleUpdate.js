/**
 * roleUpdate — log role changes (spec §4, category `roles`).
 * discord.js v14 event args: (oldRole, newRole)
 *
 * Only the properties we diff are reported, so unrelated updates (e.g. a role
 * being re-positioned by another bot) simply produce an empty field list and
 * nothing is sent.
 */
const loggingService = require('../services/loggingService');
const { findExecutor, AuditLogEvent } = require('../utils/auditLog');
const { COLORS } = require('../config/constants');

/** Getters live on the prototype, so build a plain snapshot explicitly. */
function snapshot(role) {
  return {
    name: role.name,
    hexColor: role.hexColor,
    hoist: role.hoist,
    mentionable: role.mentionable,
    position: role.position,
  };
}

function permissionNames(role) {
  try {
    return role.permissions.toArray();
  } catch {
    return [];
  }
}

module.exports = {
  name: 'roleUpdate',
  async execute(client, oldRole, newRole, ctx) {
    if (!newRole || !newRole.guild) return;

    const fields = loggingService.diff(snapshot(oldRole), snapshot(newRole), {
      name: 'logging.fields.name',
      hexColor: 'logging.fields.color',
      hoist: 'logging.fields.hoist',
      mentionable: 'logging.fields.mentionable',
      position: 'logging.fields.position',
    });

    const before = permissionNames(oldRole);
    const after = permissionNames(newRole);
    const added = after.filter((p) => !before.includes(p));
    const removed = before.filter((p) => !after.includes(p));
    if (added.length) fields.push({ nameKey: 'logging.fields.permissionsAdded', value: added.slice(0, 10).join(', '), inline: true });
    if (removed.length) fields.push({ nameKey: 'logging.fields.permissionsRemoved', value: removed.slice(0, 10).join(', '), inline: true });

    if (!fields.length) return; // nothing we track changed

    const executor = await findExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);

    await loggingService.sendLog(newRole.guild.id, 'roles', {
      titleKey: 'logging.events.roleUpdate',
      description: `**${newRole.name}** (<@&${newRole.id}>)`,
      fields: [
        ...fields,
        { nameKey: 'logging.fields.moderator', value: executor ? `<@${executor.id}>` : '—', inline: true },
      ],
      color: COLORS.warning,
    });
  },
};
