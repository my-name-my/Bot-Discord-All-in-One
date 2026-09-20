/**
 * Lệnh ticket — setup/list/close/reopen/delete. (spec §7)
 * Mỗi subcommand ánh xạ 1:1 với thao tác của ticketService.
 */
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');
const ticketService = require('../../services/ticketService');

const subcommands = [
  { name: 'setup', description: 'Send the ticket creation panel' },
  { name: 'list', description: 'List open tickets in this server' },
  { name: 'close', description: 'Close the current ticket channel' },
  { name: 'reopen', description: 'Reopen the current ticket channel' },
  { name: 'delete', description: 'Delete the current ticket channel (transcript saved)' },
  { name: 'claim', description: 'Claim the current ticket (staff)' },
];

const handlers = { setup: cmdSetup, list: cmdList, close: cmdClose, reopen: cmdReopen, delete: cmdDelete, claim: cmdClaim };

module.exports = {
  name: 'ticket',
  description: 'Ticket commands',
  category: 'tickets', aliases: ['tickets'],
  usage: 'ticket <setup|list|close|reopen|delete|claim>',
  cooldown: { seconds: 2, scope: 'user' }, permissions: { tier: 'mod' },
  guildOnly: true, slash: true,
  subcommands,
  async run(ctx) {
    if (!ctx.subcommand || !ctx.subcommand.name) return ctx.sendInfo('help.commandNotFound', { name: 'ticket' }, {}, { ephemeral: true });
    const handler = handlers[ctx.subcommand.name];
    return handler ? handler(ctx) : ctx.sendInfo('help.commandNotFound', { name: ctx.subcommand.name }, {}, { ephemeral: true });
  },
};

async function inTicketChannel(ctx) {
  const found = await ticketService.getTicketByChannel(ctx.guildId, ctx.channelId);
  return found[0] || null;
}

async function cmdSetup(ctx) {
  const channel = await ticketService.createPanel(ctx.guildId);
  if (!channel) return ctx.sendError('ticket.setupFailed', {}, {}, { ephemeral: true });
  return ctx.sendSuccess('ticket.panelSent', { channel: channel.toString() }, {}, { ephemeral: true });
}

async function cmdList(ctx) {
  const rows = await ticketService.listOpen(ctx.guildId);
  if (!rows.length) return ctx.sendError('ticket.noOpen', {}, {}, { ephemeral: true });
  const embed = new EmbedBuilder().setColor(COLORS.ticket).setTitle('🎫 Open tickets');
  const lines = rows.map((t) => `#${t.number} ${t.typeLabel || t.typeId} — <${t.channelId}>`);
  embed.setDescription(lines.slice(0, 25).join('\n'));
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdClose(ctx) {
  const doc = await inTicketChannel(ctx);
  if (!doc) return ctx.sendError('ticket.notInChannel', {}, {}, { ephemeral: true });
  if (doc.status !== 'open') return ctx.sendError('ticket.alreadyClosed', {}, {}, { ephemeral: true });
  await ticketService.closeTicket(ctx.guildId, ctx.channelId, ctx.user.id);
  return ctx.sendSuccess('ticket.closed', { staff: ctx.user.tag }, {}, { ephemeral: false });
}

async function cmdReopen(ctx) {
  const doc = await inTicketChannel(ctx);
  if (!doc) return ctx.sendError('ticket.notInChannel', {}, {}, { ephemeral: true });
  if (doc.status !== 'closed') return ctx.sendError('ticket.alreadyOpen', {}, {}, { ephemeral: true });
  await ticketService.reopenTicket(ctx.guildId, ctx.channelId);
  return ctx.sendSuccess('ticket.reopened', {}, {}, { ephemeral: false });
}

async function cmdDelete(ctx) {
  const doc = await inTicketChannel(ctx);
  if (!doc) return ctx.sendError('ticket.notInChannel', {}, {}, { ephemeral: true });
  await ticketService.deleteTicket(ctx.guildId, ctx.channelId, ctx.user.id);
  return ctx.sendSuccess('ticket.deleted', {}, {}, { ephemeral: false });
}

async function cmdClaim(ctx) {
  const doc = await inTicketChannel(ctx);
  if (!doc) return ctx.sendError('ticket.notInChannel', {}, {}, { ephemeral: true });
  const claimed = await ticketService.claimTicket(ctx.guildId, ctx.channelId, ctx.user.id);
  if (!claimed) return ctx.sendError('ticket.claimFailed', {}, {}, { ephemeral: true });
  return ctx.sendSuccess('ticket.claimed', { staff: ctx.user.tag }, {}, { ephemeral: false });
}
