/** Giveaway button route: join/leave. */
const giveawayService = require('../services/giveawayService');

/**
 * Map trạng thái service trả về → key i18n. Trước đây handler chỉ so sánh
 * 'joined'/'left' nên mọi trường hợp khác (đã kết thúc, thiếu role, tài khoản
 * quá mới) đều rơi vào thông báo lỗi chung chung.
 */
const STATUS_KEYS = {
  joined: 'giveaway.joined',
  left: 'giveaway.left',
  notFound: 'giveaway.notFound',
  ended: 'giveaway.alreadyEnded',
  notEligibleRole: 'giveaway.notEligibleRole',
  notEligibleAge: 'giveaway.notEligibleAge',
  memberLeft: 'giveaway.memberLeft',
};

function safeReply(interaction, content) {
  // Cả hai nhánh đều phải catch: nhánh followUp trước đây trả promise trần nên
  // interaction hết hạn sẽ tạo unhandled rejection.
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp({ content, flags: 64 }).catch(() => {});
  }
  return interaction.reply({ content, flags: 64 }).catch(() => {});
}

async function join({ interaction, t }) {
  const result = await giveawayService.toggleJoin(interaction.guildId, interaction.message.id, interaction.user.id);
  const status = result && result.status;
  const key = STATUS_KEYS[status] || 'common.error';
  return safeReply(interaction, t(key, (result && result.params) || {}));
}

module.exports = { register(handler) { handler.registerComponent('giveaway', 'join', join); } };
