/**
 * messageReactionAdd — reaction roles (spec §6 "Reaction roles").
 *
 * Partial reaction/user được fetch trước khi xử lý. Bot tự react khi tạo
 * menu nên bỏ qua mọi reaction của bot. Chỉ menu type 'reaction' mới xử lý.
 */
const roleMenuService = require('../services/roleMenuService');
const logger = require('../utils/logger');

module.exports = {
  name: 'messageReactionAdd',
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
      // User partial (chưa cache) vẫn có id — fetch member trực tiếp.
      const member = await message.guild.members.fetch(user.id).catch(() => null);
      if (!member) return;
      const doc = await ctx.services.roleMenuService.byMessage(message.id);
      if (!doc || doc.type !== 'reaction') return;
      const roleId = roleMenuService.roleIdForReaction(doc, reaction.emoji);
      if (!roleId) return;
      if (member.roles.cache.has(roleId)) return;
      const result = await ctx.services.roleMenuService.toggle(message.guild.id, member, roleId);
      // Không gán được (hierarchy/xóa role) → gỡ reaction để user biết.
      if (result.error) {
        await reaction.users.remove(user.id).catch(() => {});
      }
    } catch (error) {
      logger.error('rolemenu', `messageReactionAdd failed: ${error.message}`);
    }
  },
};
