/** Dieu huong tuong tac slash / button / select / modal ve cac module tinh nang. */
const componentHandler = require('../handlers/componentHandler');

function isSlash(interaction) {
  return typeof interaction.isChatInputCommand === 'function'
    ? interaction.isChatInputCommand()
    : Boolean(interaction.isChatInputCommand);
}

function isComponent(interaction) {
  if (typeof interaction.isButton === 'function' && interaction.isButton()) return true;
  if (typeof interaction.isAnySelectMenu === 'function' && interaction.isAnySelectMenu()) return true;
  // String/role/channel/user selects tren discord.js cu khong co isAnySelectMenu.
  if (typeof interaction.isStringSelectMenu === 'function' && interaction.isStringSelectMenu()) return true;
  if (typeof interaction.isModalSubmit === 'function' && interaction.isModalSubmit()) return true;
  return false;
}

module.exports = {
  name: 'interactionCreate',
  async execute(client, interaction, ctx) {
    try {
      if (isSlash(interaction)) {
        await ctx.commandHandler.handleSlash(interaction);
        return;
      }
      // Button, select menu, modal -> route component
      if (isComponent(interaction)) {
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
  // Exported for the regression suite (no Discord round-trip needed).
  _helpers: { isSlash, isComponent },
};
