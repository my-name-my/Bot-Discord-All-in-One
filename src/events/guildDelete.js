/** guildDelete — keep storage tidy: config is kept (rejoin keeps settings). */
module.exports = {
  name: 'guildDelete',
  async execute(client, guild) {
    // Intentionally NOT deleting guild config: if the bot is re-invited,
    // server settings survive. Data can be purged manually via /config reset.
  },
};
