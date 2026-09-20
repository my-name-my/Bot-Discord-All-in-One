/** Global safety nets — a rejected promise or uncaught error never kills the bot. */
const logger = require('../utils/logger');

module.exports = {
  name: 'shardError',
  async execute(client, error) {
    logger.error('shard', error.message);
  },
};
