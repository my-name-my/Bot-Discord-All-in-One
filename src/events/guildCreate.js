/** guildCreate — ensure per-guild config + register guild-only slash commands. */
const config = require('../config/config');
const guildConfigService = require('../services/guildConfigService');
const { buildSlashCommands } = require('../handlers/slashBuilder');
const logger = require('../utils/logger');
const { REST, Routes } = require('discord.js');

module.exports = {
  name: 'guildCreate',
  async execute(client, guild, ctx) {
    try {
      await guildConfigService.ensure(guild.id);
      logger.info('guild', `Joined ${guild.name} (${guild.id}) — config ensured`);
    } catch (error) {
      logger.error('guild', `config ensure failed for ${guild.id}: ${error.message}`);
    }
    // Guild-only mode: register slash commands to the new guild immediately.
    if (config.autoRegisterCommands) {
      try {
        const body = buildSlashCommands(ctx?.commands?.all?.() || client.commands?.all?.() || []);
        const rest = new REST().setToken(config.token);
        await rest.put(Routes.applicationGuildCommands(config.clientId, guild.id), { body });
        logger.info('guild', `Registered ${body.length} slash command(s) to new guild ${guild.id}`);
      } catch (error) {
        logger.error('guild', `slash registration failed for ${guild.id}: ${error.message}`);
      }
    }
  },
};
