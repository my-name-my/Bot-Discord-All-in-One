/**
 * Lệnh context menu — "Profile" (chuột phải vào một user). (spec §21)
 * Đăng ký dạng user context menu qua trường `contextMenu`.
 * Hàm run() nhận Context trong đó `target`/selectedUserId là
 * user mà menu được gọi tới.
 */
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');
const levelService = require('../../services/levelService');
const economyService = require('../../services/economyService');

module.exports = {
  name: 'profile',
  description: 'Show level & economy profile (context menu)',
  category: 'context', aliases: [],
  usage: '[right-click a user → Apps → Profile]',
  cooldown: { seconds: 2, scope: 'user' }, permissions: { tier: 'member' },
  slash: true,
  contextMenu: { type: 'user', name: 'Profile' },
  async run(ctx) {
    const target = ctx.options?.target || ctx.user;
    if (!target) return;
    const record = await levelService.getRecord(ctx.guildId, target.id);
    const balances = await economyService.getBalances(ctx.guildId, target.id);
    const embed = new EmbedBuilder().setColor(COLORS.primary)
      .setThumbnail(target.displayAvatarURL({ size: 128 }))
      .setTitle(`${target.username}'s Profile`)
      .addFields(
        { name: 'Level', value: String(record.level || 0), inline: true },
        { name: 'XP', value: String(record.xp || 0), inline: true },
        { name: 'Wallet', value: `${balances.wallet} coins`, inline: true },
      );
    return ctx.reply({ embeds: [embed] }, { ephemeral: ctx.isSlash });
  },
};
