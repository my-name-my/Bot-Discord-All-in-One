/** Ready — ghi log trang thai, dang ky slash, khoi phuc timer. */
const config = require('../config/config');
const logger = require('../utils/logger');
const { buildSlashCommands } = require('../handlers/slashBuilder');
const { REST, Routes } = require('discord.js');

module.exports = {
  name: 'clientReady',
  once: true,
  // EventLoader goi execute(client, ...emittedArgs, ctx).
  // clientReady emit (client) → chuoi tham so day du la (client, emittedClient, ctx).
  async execute(client, emittedClient, ctx) {
    ctx = ctx || {};
    const commands = ctx.commands?.all?.() || [];
    logger.info('ready', `Logged in as ${client.user.tag} (${client.user.id})`);
    logger.info('ready', `Serving ${client.guilds.cache.size} guild(s), db=${ctx.db?.type || 'unknown'}`);

    client.user.setPresence({
      activities: [{ name: `${config.defaultPrefix}help | /help`, type: 3 }], // 3 = WATCHING
      status: 'online',
    });

    if (config.autoRegisterCommands) {
      try {
        const body = buildSlashCommands(commands);
        const rest = new REST().setToken(config.token);
        const targetGuildIds = config.devGuildId
          ? [config.devGuildId]
          : [...client.guilds.cache.keys()];
        if (!targetGuildIds.length) {
          logger.warn('ready', 'No guilds in cache — skipping guild slash registration');
        }
        let ok = 0;
        for (const guildId of targetGuildIds) {
          try {
            await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body });
            ok++;
            logger.info('ready', `Registered ${body.length} slash command(s) to guild ${guildId}`);
          } catch (err) {
            logger.error('ready', `Slash registration failed for guild ${guildId}: ${err.message}`);
          }
        }
        // Xoa sach lenh GLOBAL cu de chi con lenh cap server.
        try {
          await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
          logger.info('ready', 'Cleared global slash commands (guild-only mode)');
        } catch (err) {
          logger.warn('ready', `Could not clear global commands: ${err.message}`);
        }
        logger.info('ready', `Guild slash registration done: ${ok}/${targetGuildIds.length} guild(s)`);
      } catch (error) {
        logger.error('ready', `Slash registration failed: ${error.message}`);
      }
    }

    // Khoi phuc cac timer ben vung (giveaway, temp role)
    try {
      if (ctx.services?.giveawayService) await ctx.services.giveawayService.restore(client);
      if (ctx.services?.tempRoleService) await ctx.services.tempRoleService.restore(client);
    } catch (error) {
      logger.error('ready', `Timer restore failed: ${error.message}`);
    }

    // AutoMod: mot lockdown dang chay khi bot restart phai duoc re-arm,
    // neu khong quyen @everyone se bi khoa vinh vien.
    try {
      if (ctx.services?.automodService?.restore) await ctx.services.automodService.restore(client);
    } catch (error) {
      logger.error('ready', `AutoMod restore failed: ${error.message}`);
    }
  },
};
