/** messageCreate — prefix command routing + automod + XP. */
const prefixParser = require('../handlers/prefixParser');
const guildConfigService = require('../services/guildConfigService');

module.exports = {
  name: 'messageCreate',
  async execute(client, message, ctx) {
    if (message.author.bot || !message.guild) return;

    // AutoMod first (may delete the message / punish the author).
    try {
      const handled = await ctx.services.automodService.handleMessage(message, ctx);
      if (handled) return;
    } catch { /* automodService handles its own logging */ }

    // XP system (cooldown + no-xp filtering live inside the service).
    ctx.services.levelService.handleMessage(message, client).catch(() => {});

    // Prefix commands.
    const guildConfig = await guildConfigService.get(message.guild.id);
    const prefix = guildConfig.prefix || ctx.defaultPrefix;
    const parsed = prefixParser.parse(message, prefix, ctx.commands);
    if (!parsed) return;

    await ctx.commandHandler.handlePrefix(message, parsed, prefix);
  },
};
