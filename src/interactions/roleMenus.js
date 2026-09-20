/**
 * Role-menu routes: select menu + button roles.
 *
 * safeReply nhận STRING (không phải object) — vì vậy route này giữ helper
 * riêng thay vì componentHandler.safeReply (helper đó nhận payload object).
 */
const roleMenuService = require('../services/roleMenuService');

function safeReply(interaction, content) {
  if (interaction.deferred && !interaction.replied) return interaction.followUp({ content, flags: 64 });
  return interaction.reply({ content, flags: 64 }).catch(() => {});
}

async function select({ interaction, t }) {
  const doc = await roleMenuService.byMessage(interaction.message.id);
  if (!doc) return safeReply(interaction, t('roles.menuNotFound', { id: interaction.message.id }));
  const member = interaction.member;
  const selected = new Set(interaction.values || []);
  const added = [], removed = [], skipped = [];
  for (const opt of doc.options || []) {
    if (!opt.roleId) continue;
    const has = member.roles.cache.has(opt.roleId);
    if (selected.has(opt.roleId) && !has) {
      const r = await roleMenuService.toggle(interaction.guildId, member, opt.roleId);
      if (r.added) added.push(opt.label);
      // Nhánh hierarchy: bỏ qua option không gán được thay vì dừng cả menu
      // mà không báo gì cho các option còn lại (lỗi dừng-sớm cũ).
      else if (r.error === 'hierarchy') skipped.push(opt.label);
    } else if (!selected.has(opt.roleId) && has) {
      const r = await roleMenuService.toggle(interaction.guildId, member, opt.roleId);
      if (r.removed) removed.push(opt.label);
    }
  }
  let text = '';
  if (added.length) text += t('roles.menuAdded', { role: added.join(', ') }) + ' ';
  if (removed.length) text += t('roles.menuRemoved', { role: removed.join(', ') }) + ' ';
  if (skipped.length) text += t('roles.rewardSkipped', { role: skipped.join(', ') }) + ' ';
  return safeReply(interaction, text || '✅ ' + t('common.success'));
}

async function buttonRole({ interaction, params, t }) {
  const roleId = params[0];
  const r = await roleMenuService.toggle(interaction.guildId, interaction.member, roleId);
  if (!r.role) return safeReply(interaction, t('roles.roleNotFound'));
  if (r.error === 'hierarchy') return safeReply(interaction, t('common.botNoPermissions', { permission: 'Manage Roles' }));
  if (r.added) return safeReply(interaction, t('roles.menuAdded', { role: r.role.name }));
  if (r.removed) return safeReply(interaction, t('roles.menuRemoved', { role: r.role.name }));
  return safeReply(interaction, t('common.error'));
}

module.exports = {
  register(handler) {
    handler.registerComponent('rolemenu', 'select', select);
    handler.registerComponent('rolemenu', 'btn', buttonRole);
  },
};
