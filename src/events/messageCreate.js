/** messageCreate — prefix command routing + automod + XP. */
const prefixParser = require('../handlers/prefixParser');
const guildConfigService = require('../services/guildConfigService');
const logger = require('../utils/logger');

module.exports = {
  name: 'messageCreate',
  async execute(client, message, ctx) {
    if (message.author.bot || !message.guild) return;

    // Doc config 1 lan roi chia se cho ca AutoMod lan lenh prefix: truoc day
    // moi message doc 2 lan va hai nhanh co the thay 2 snapshot khac nhau.
    let guildConfig = null;
    try {
      guildConfig = await guildConfigService.get(message.guild.id);
    } catch (error) {
      logger.error('events', `guild config lookup failed in ${message.guild.id}: ${error.message}`);
    }
    const localCtx = Object.assign({}, ctx, { guildConfig });

    // AutoMod first (may delete the message / punish the author).
    try {
      const handled = await ctx.services.automodService.handleMessage(message, localCtx);
      if (handled) return;
    } catch (error) {
      // Never break the command pipeline, but do not hide the failure either:
      // a silent catch here once masked a missing helper for weeks.
      logger.error('automod', `handleMessage failed in ${message.guild.id}: ${error.stack || error}`);
    }

    // XP system (cooldown + no-xp filtering live inside the service).
    ctx.services.levelService.handleMessage(message, client).catch((error) => {
      logger.error('levels', `XP grant failed in ${message.guild.id}: ${error.stack || error}`);
    });

    // Prefix commands.
    const prefix = (guildConfig && guildConfig.prefix) || ctx.defaultPrefix;
    const parsed = prefixParser.parse(message, prefix, ctx.commands);
    if (!parsed) return;

    await ctx.commandHandler.handlePrefix(message, parsed, prefix);
  },
};
