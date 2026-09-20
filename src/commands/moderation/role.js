const moderationService = require('../../services/moderationService');

module.exports = {
  name: 'role',
  description: 'Add or remove a role from a member',
  category: 'moderation',
  usage: 'role <add|remove> <role> <user> [reason]',
  cooldown: { seconds: 3, scope: 'user' },
  permissions: { tier: 'admin', bot: ['ManageRoles'] },
  guildOnly: true,
  slash: true,
  subcommands: [
    { name: 'add', description: 'Add a role to a member', options: [{ name: 'role', type: 'role', description: 'Role to add', required: true }, { name: 'user', type: 'member', description: 'Target member', required: true }, { name: 'reason', type: 'string', description: 'Reason', required: false }] },
    { name: 'remove', description: 'Remove a role from a member', options: [{ name: 'role', type: 'role', description: 'Role to remove', required: true }, { name: 'user', type: 'member', description: 'Target member', required: true }, { name: 'reason', type: 'string', description: 'Reason', required: false }] },
  ],
  async run(ctx) {
    const action = ctx.subcommand && ctx.subcommand.name;
    const target = ctx.getMember('user');
    const role = ctx.getRole('role');
    if (!role) return ctx.sendError('roles.roleNotFound', {}, {}, { ephemeral: true });
    if (!target) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });
    const r = await moderationService.canModerate(ctx.member, target);
    if (!r.ok) return ctx.sendError(r.reason, {}, {}, { ephemeral: true });
    if (role.position >= ctx.guild.members.me.roles.highest.position && ctx.guild.ownerId !== ctx.guild.members.me.id) {
      return ctx.sendError('moderation.roleHierarchyBot', {}, {}, { ephemeral: true });
    }
    try {
      if (action === 'remove') {
        if (!target.roles.cache.has(role.id)) return ctx.sendError('moderation.roleRemoved', { user: target.user.tag, role: role.name }, {}, { ephemeral: true });
        await target.roles.remove(role, ctx.getString('reason', 'role add'));
        await moderationService.logAction(ctx.guildId, 'roles', { title: `🎭 Role removed: ${role.name}`, fields: [{ name: 'User', value: target.user.tag, inline: true }, { name: 'Moderator', value: ctx.user.tag, inline: true }], color: 0xfee75c });
        return ctx.sendSuccess('moderation.roleRemoved', { user: target.user.tag, role: role.name });
      }
      await target.roles.add(role, ctx.getString('reason', 'role add'));
      await moderationService.logAction(ctx.guildId, 'roles', { title: `🎭 Role added: ${role.name}`, fields: [{ name: 'User', value: target.user.tag, inline: true }, { name: 'Moderator', value: ctx.user.tag, inline: true }], color: 0x57f287 });
      return ctx.sendSuccess('moderation.roleAdded', { user: target.user.tag, role: role.name });
    } catch (e) {
      return ctx.sendError('moderation.roleHierarchyBot', {}, {}, { ephemeral: true });
    }
  },
};
