/**
 * guildMemberAdd — welcome message + auto role + AutoMod mass-join/raid check.
 * Order matters: AutoMod evaluates the raid first (may lock @everyone down),
 * then the welcome flow runs so new members still get their auto role.
 */
const logger = require('../utils/logger');

module.exports = {
  name: 'guildMemberAdd',
  async execute(client, member, ctx) {
    try {
      const fired = await ctx.services.automodService.handleJoin(member);
      if (fired) logger.warn('automod', `Mass-join action fired in ${member.guild.id}`);
    } catch (error) {
      logger.error('automod', `handleJoin failed for ${member.guild.id}: ${error.message}`);
    }

    try {
      await ctx.services.welcomeService.sendWelcome(member);
    } catch (error) {
      logger.error('welcome', `sendWelcome failed for ${member.id}: ${error.message}`);
    }
  },
};
