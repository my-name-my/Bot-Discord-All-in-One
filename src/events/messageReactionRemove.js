/**
 * messageReactionRemove — gỡ reaction thì gỡ role (spec §6 "Reaction roles").
 *
 * Đối xứng với messageReactionAdd: chỉ menu type 'reaction', bỏ qua bot,
 * xử lý partial, và nuốt lỗi (event không bao giờ throw).
 */
const roleMenuService = require('../services/roleMenuService');
const logger = require('../utils/logger');

module.exports = {
  name: 'messageReactionRemove',
  async execute(client, reaction, user, ctx) {
    try {
      if (user && user.bot) return;
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch {
          return;
        }
      }
      const message = reaction.message;
      if (!message || !message.guild) return;
      const member = await message.guild.members.fetch(user.id).catch(() => null);
      if (!member) return;
      const doc = await ctx.services.roleMenuService.byMessage(message.id);
      if (!doc || doc.type !== 'reaction') return;
      const roleId = roleMenuService.roleIdForReaction(doc, reaction.emoji);
      if (!roleId) return;
      if (!member.roles.cache.has(roleId)) return;
      const role = message.guild.roles.cache.get(roleId);
      if (!role) return;
      await member.roles.remove(role, 'Reaction role removed').catch(() => {});
    } catch (error) {
      logger.error('rolemenu', `messageReactionRemove failed: ${error.message}`);
    }
  },
};
