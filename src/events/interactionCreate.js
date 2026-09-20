/** Dieu huong tuong tac button / select / modal ve cac module tinh nang. */
const componentHandler = require('../handlers/componentHandler');

module.exports = {
  name: 'interactionCreate',
  async execute(client, interaction, ctx) {
    try {
      if (interaction.isChatInputCommand) {
        await ctx.commandHandler.handleSlash(interaction);
        return;
      }
      // Button, select menu, modal -> route component
      if (
        interaction.isButton &&
        (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit())
      ) {
        await componentHandler.dispatch(client, interaction);
      }
    } catch (error) {
      // Last-resort guard: never let an interaction reject unhandled.
      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({ content: '❌ An error occurred. Please try again later.', flags: 64 });
        } catch { /* expired */ }
      }
      throw error; // bubble for centralized logging
    }
  },
};
