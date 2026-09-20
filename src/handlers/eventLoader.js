/**
 * Event loader — discovers event modules under src/events and wires them
 * to the Discord client. An event module exports:
 *   { name: 'messageCreate', once: false, execute: async (client, ...args) => {} }
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class EventLoader {
  constructor() {
    this.registered = [];
  }

  load(client, eventsDir, ctx) {
    if (!fs.existsSync(eventsDir)) {
      logger.warn('events', `Directory not found: ${eventsDir}`);
      return { loaded: 0, errors: [] };
    }
    const errors = [];
    const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'));
    let loaded = 0;

    for (const file of files) {
      const filePath = path.join(eventsDir, file);
      try {
        delete require.cache[require.resolve(filePath)];
        const event = require(filePath);
        if (!event || !event.name || typeof event.execute !== 'function') {
          errors.push(`${filePath}: missing name or execute()`);
          continue;
        }
        const handler = async (...args) => {
          try {
            await event.execute(client, ...args, ctx);
          } catch (error) {
            logger.error('events', `${event.name} handler failed: ${error.stack || error}`);
          }
        };
        if (event.once) client.once(event.name, handler);
        else client.on(event.name, handler);
        this.registered.push(event.name);
        loaded++;
      } catch (error) {
        errors.push(`${filePath}: ${error.message}`);
      }
    }

    logger.info('events', `Registered ${loaded} event handler(s)`);
    for (const error of errors) logger.error('events', error);
    return { loaded, errors };
  }
}

module.exports = { EventLoader };
