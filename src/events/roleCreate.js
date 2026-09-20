/**
 * roleCreate — log new roles (spec §4, category `roles`).
 * discord.js v14 event args: (role)
 */
const loggingService = require('../services/loggingService');
const { findExecutor, AuditLogEvent } = require('../utils/auditLog');
const { COLORS } = require('../config/constants');

module.exports = {
  name: 'roleCreate',
  async execute(client, role, ctx) {
    if (!role || !role.guild) return;
    const executor = await findExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);

    await loggingService.sendLog(role.guild.id, 'roles', {
      titleKey: 'logging.events.roleCreate',
      description: `**${role.name}**`,
      fields: [
        { nameKey: 'logging.fields.role', value: `<@&${role.id}>`, inline: true },
        { nameKey: 'logging.fields.moderator', value: executor ? `<@${executor.id}>` : '—', inline: true },
        { nameKey: 'logging.fields.color', value: role.hexColor || '—', inline: true },
      ],
      color: COLORS.success,
    });
  },
};
