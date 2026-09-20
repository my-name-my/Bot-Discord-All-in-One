/**
 * Pre-styled EmbedBuilder factories so every module looks consistent.
 */
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../config/constants');

const embed = (color) => new EmbedBuilder().setColor(color).setTimestamp();

module.exports = {
  embed,
  successEmbed: (text) => embed(COLORS.success).setDescription(text),
  errorEmbed: (text) => embed(COLORS.error).setDescription(text),
  infoEmbed: (text) => embed(COLORS.primary).setDescription(text),
  warningEmbed: (text) => embed(COLORS.warning).setDescription(text),
  neutralEmbed: (text) => embed(COLORS.neutral).setDescription(text),
};
