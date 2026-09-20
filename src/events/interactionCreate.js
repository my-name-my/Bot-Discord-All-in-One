/** Routes button / select / modal interactions to feature modules. */
const componentHandler = require('../handlers/componentHandler');

module.exports = {
  name: 'interactionCreate',
  async execute(client, interaction, ctx) {
    try {
      if (interaction.isChatInputCommand) {
        await ctx.commandHandler.handleSlash(interaction);
        return;
      }
      // Buttons, select menus, modals → component routes
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
