/**
 * channelUpdate — log channel changes (spec §4, category `channels`).
 * discord.js v14 event args: (oldChannel, newChannel)
 *
 * Covers name/topic/nsfw/slowmode/user-limit/category changes AND permission
 * overwrite changes, which is how /lock, /unlock and manual permission edits
 * get logged (no command-side duplicate logging needed).
 * Events where nothing we track changed are dropped.
 */
const loggingService = require('../services/loggingService');
const { findExecutor, AuditLogEvent } = require('../utils/auditLog');
const { COLORS } = require('../config/constants');

const MAX_OVERWRITE_LINES = 6;
const MAX_PERMISSION_NAMES = 6;

/** Getters live on the prototype, so snapshot the properties explicitly. */
function snapshot(channel) {
  return {
    name: channel.name,
    topic: channel.topic,
    nsfw: channel.nsfw,
    rateLimitPerUser: channel.rateLimitPerUser,
    userLimit: channel.userLimit,
    parentId: channel.parentId ? `<#${channel.parentId}>` : null,
    position: channel.position,
  };
}

function permissionNames(permissions) {
  try {
    return permissions.toArray();
  } catch {
    return [];
  }
}

/** id → { type, allow, deny } for every overwrite on the channel. */
function overwriteSnapshot(channel) {
  const map = new Map();
  const cache = channel.permissionOverwrites && channel.permissionOverwrites.cache;
  if (!cache) return map;
  for (const [id, overwrite] of cache) {
    map.set(id, {
      type: overwrite.type,
      allow: permissionNames(overwrite.allow),
      deny: permissionNames(overwrite.deny),
    });
  }
  return map;
}

function targetLabel(id, type) {
  return type === 0 ? `<@&${id}>` : `<@${id}>`; // 0 = role overwrite, 1 = member
}

function overwriteFields(oldChannel, newChannel) {
  const before = overwriteSnapshot(oldChannel);
  const after = overwriteSnapshot(newChannel);
  const changed = [];
  for (const [id, record] of after) {
    const previous = before.get(id);
    if (!previous || JSON.stringify(previous) !== JSON.stringify(record)) changed.push(id);
  }
  for (const id of before.keys()) if (!after.has(id)) changed.push(id);
  if (!changed.length) return [];

  const lines = changed.slice(0, MAX_OVERWRITE_LINES).map((id) => {
    const record = after.get(id) || before.get(id);
    const label = targetLabel(id, record.type);
    if (!after.has(id)) return `❌ ${label}`; // overwrite removed
    const parts = [];
    if (record.allow.length) parts.push(`✅ ${record.allow.slice(0, MAX_PERMISSION_NAMES).join(', ')}`);
    if (record.deny.length) parts.push(`⛔ ${record.deny.slice(0, MAX_PERMISSION_NAMES).join(', ')}`);
    return `${label}: ${parts.join(' | ') || '—'}`;
  });
  if (changed.length > MAX_OVERWRITE_LINES) lines.push(`… +${changed.length - MAX_OVERWRITE_LINES}`);

  return [{ nameKey: 'logging.fields.overwrites', value: lines.join('\n').slice(0, 1024) }];
}

module.exports = {
  name: 'channelUpdate',
  async execute(client, oldChannel, newChannel, ctx) {
    if (!newChannel || !newChannel.guild) return;

    const fields = [
      ...loggingService.diff(snapshot(oldChannel), snapshot(newChannel), {
        name: 'logging.fields.name',
        topic: 'logging.fields.topic',
        nsfw: 'logging.fields.nsfw',
        rateLimitPerUser: 'logging.fields.slowmode',
        userLimit: 'logging.fields.userLimit',
        parentId: 'logging.fields.category',
        position: 'logging.fields.position',
      }),
      ...overwriteFields(oldChannel, newChannel),
    ];

    if (!fields.length) return; // nothing we track changed

    const executor = await findExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);

    await loggingService.sendLog(newChannel.guild.id, 'channels', {
      titleKey: 'logging.events.channelUpdate',
      description: `<#${newChannel.id}> **${newChannel.name || '—'}**`,
      fields: [
        ...fields,
        { nameKey: 'logging.fields.moderator', value: executor ? `<@${executor.id}>` : '—', inline: true },
      ],
      color: COLORS.warning,
    });
  },
};
