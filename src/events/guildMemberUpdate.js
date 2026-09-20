/**
 * guildMemberUpdate — nickname changes (spec §4, category `members`).
 *
 * This event is the single owner of nickname logging: it also catches changes
 * made outside the bot (Discord UI, other bots), and it attributes the author
 * through the audit log. `/nick` therefore does not log on its own — see
 * src/commands/moderation/nick.js.
 *
 * Timeout changes (communicationDisabledUntil) also fire this event but are
 * intentionally ignored: moderationService/AutoMod already log them with the
 * moderator attached, and logging both would duplicate every timeout.
 */
const loggingService = require('../services/loggingService');
const { findExecutor, AuditLogEvent } = require('../utils/auditLog');
const { COLORS } = require('../config/constants');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(client, oldMember, newMember, ctx) {
    if (!newMember || !newMember.guild) return;
    const before = oldMember ? oldMember.nickname : null;
    const after = newMember.nickname;
    if (before === after) return;

    const executor = await findExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);

    await loggingService.sendLog(newMember.guild.id, 'members', {
      titleKey: 'logging.events.nickname',
      fields: [
        { nameKey: 'logging.fields.user', value: `${newMember.user.tag} (<@${newMember.id}>)`, inline: true },
        { nameKey: 'logging.fields.moderator', value: executor ? `<@${executor.id}>` : '—', inline: true },
        { nameKey: 'logging.fields.before', value: before || '—' },
        { nameKey: 'logging.fields.after', value: after || '—' },
      ],
      thumbnail: newMember.user.displayAvatarURL ? newMember.user.displayAvatarURL({ size: 128 }) : null,
      color: COLORS.warning,
    });
  },
};
