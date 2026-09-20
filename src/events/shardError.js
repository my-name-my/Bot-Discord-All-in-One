/** Mang an toan toan cuc — promise tu choi hoac loi chua bat khong bao gio lam chet bot. */
const logger = require('../utils/logger');

module.exports = {
  name: 'shardError',
  async execute(client, error) {
    logger.error('shard', error.message);
  },
};
