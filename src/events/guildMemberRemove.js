/**
 * guildMemberRemove — goodbye message + leave logging.
 * `member.partial` is possible (uncached leave): welcomeService handles the
 * missing user gracefully, and we never throw out of an event handler.
 */
const logger = require('../utils/logger');

module.exports = {
  name: 'guildMemberRemove',
  async execute(client, member, ctx) {
    try {
      await ctx.services.welcomeService.sendGoodbye(member);
    } catch (error) {
      logger.error('welcome', `sendGoodbye failed for ${member.id}: ${error.message}`);
    }
  },
};
