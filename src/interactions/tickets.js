/**
 * Ticket component routes. (spec §7)
 *   ticket:select  — select menu that opens a ticket by type
 *   ticket:claim   — staff claims the ticket
 *   ticket:close   — close (rename + lock UI)
 *   ticket:reopen  — reopen
 *   ticket:delete  — transcript + delete channel
 *   ticket:add     — add a member (modal)
 *   ticket:remove  — remove a member (modal)
 */
const ticketService = require('../services/ticketService');
const guildConfigService = require('../services/guildConfigService');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

function safeReply(interaction, payload, ephemeral = true) {
  if (interaction.deferred && !interaction.replied) {
    return interaction.followUp({ ...payload, flags: ephemeral ? 64 : void 0 });
  }
  return interaction.reply({ ...payload, flags: ephemeral ? 64 : void 0 }).catch(() => {});
}

/** Staff = ManageMessages **in this channel** (overwrites) or guild-wide. */
function isStaff(member, channel) {
  if (!member) return false;
  if (member.permissions && member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const perms = channel ? channel.permissionsFor(member) : null;
  return Boolean(perms && perms.has(PermissionFlagsBits.ManageMessages));
}

async function findDoc(interaction) {
  const found = await ticketService.getTicketByChannel(interaction.guildId, interaction.channelId);
  return found[0] || null;
}

function buildButtons(status, t) {
  const row = new ActionRowBuilder();
  if (status === 'open') {
    row.addComponents(
      new ButtonBuilder().setCustomId('ticket:claim').setLabel(t('ticket.claimBtn')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket:close').setLabel(t('ticket.closeBtn')).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket:delete').setLabel(t('ticket.deleteBtn')).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket:add').setLabel(t('ticket.addBtn')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket:remove').setLabel(t('ticket.removeBtn')).setStyle(ButtonStyle.Secondary),
    );
  } else {
    row.addComponents(
      new ButtonBuilder().setCustomId('ticket:reopen').setLabel(t('ticket.reopenBtn')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket:delete').setLabel(t('ticket.deleteBtn')).setStyle(ButtonStyle.Danger),
    );
  }
  return row;
}

async function selectTicketType({ interaction, params, t }) {
  const typeId = params[0];
  const result = await ticketService.openTicket(interaction.guildId, interaction.user.id, typeId);
  if (result?.error === 'typeNotFound') return safeReply(interaction, { content: t('ticket.typeNotFound') });
  if (result?.error === 'maxReached') return safeReply(interaction, { content: t('ticket.maxReached', { max: result.max }) });
  if (result?.error === 'alreadyOpen') {
    return safeReply(interaction, { content: t('ticket.alreadyOpen', { channel: `<#${result.existing.channelId}>` }) });
  }
  if (result?.error) return safeReply(interaction, { content: t('common.error') });
  return safeReply(interaction, { content: t('ticket.created', { channel: `<#${result.channelId}>` }) });
}

async function claim({ interaction, t }) {
  const doc = await findDoc(interaction);
  if (!doc) return safeReply(interaction, { content: t('ticket.notTicketChannel') });
  if (!isStaff(interaction.member, interaction.channel)) return safeReply(interaction, { content: t('ticket.staffOnly') });
  const result = await ticketService.claimTicket(interaction.guildId, interaction.channelId, interaction.user.id);
  if (result?.error === 'alreadyClosed') return safeReply(interaction, { content: t('ticket.alreadyClosed') });
  if (result?.error === 'claimFailed') return safeReply(interaction, { content: t('ticket.claimFailed') });
  return safeReply(interaction, { content: t('ticket.claimed', { staff: interaction.user.tag }) });
}

async function close({ interaction, t }) {
  const doc = await findDoc(interaction);
  if (!doc) return safeReply(interaction, { content: t('ticket.notTicketChannel') });
  if (!isStaff(interaction.member, interaction.channel)) return safeReply(interaction, { content: t('ticket.staffOnly') });
  if (doc.status !== 'open') return safeReply(interaction, { content: t('ticket.alreadyClosed') });
  // closeTicket renames + locks the channel (shared logic, one place only).
  await ticketService.closeTicket(interaction.guildId, interaction.channelId, interaction.user.id, doc.number);
  await interaction.message.edit({ components: [buildButtons('closed', t)] }).catch(() => {});
  return safeReply(interaction, { content: t('ticket.closed', { staff: interaction.user.tag }) });
}


async function reopen({ interaction, t }) {
  const doc = await findDoc(interaction);
  if (!doc) return safeReply(interaction, { content: '❓ This is not a ticket channel.' });
  if (!isStaff(interaction.member, interaction)) return safeReply(interaction, { content: t('ticket.staffOnly') });
  if (doc.status !== 'closed') return safeReply(interaction, { content: 'ℹ️ This ticket is already open.' });
  await ticketService.reopenTicket(interaction.guildId, interaction.channelId);
  await interaction.channel?.edit({ name: `ticket-${doc.number}` }).catch(() => {});
  await interaction.message.edit({ components: [buildButtons('open')] }).catch(() => {});
  return safeReply(interaction, { content: t('ticket.reopened') });
}

async function del({ interaction, t }) {
  const doc = await findDoc(interaction);
  if (!doc) return safeReply(interaction, { content: '❓ This is not a ticket channel.' });
  if (!isStaff(interaction.member, interaction)) return safeReply(interaction, { content: t('ticket.staffOnly') });
  await ticketService.deleteTicket(interaction.guildId, interaction.channelId, interaction.user.id);
  return safeReply(interaction, { content: t('common.success') });
}

function makeAddRemove(action) {
  return async ({ interaction, t }) => {
    const doc = await findDoc(interaction);
    if (!doc) return safeReply(interaction, { content: '❓ This is not a ticket channel.' });
    if (!isStaff(interaction.member, interaction)) return safeReply(interaction, { content: t('ticket.staffOnly') });
    const modal = new ModalBuilder()
      .setCustomId(`modal:ticket:${action}:confirm`)
      .setTitle(action === 'add' ? 'Add member' : 'Remove member')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('target').setLabel('User ID').setStyle(TextInputStyle.Short).setRequired(true),
        ),
      );
    await interaction.showModal(modal);
  };
}

async function addMemberModal({ interaction, t }) {
  const targetId = interaction.fields.getTextInputValue('target');
  await ticketService.addMember(interaction.guildId, interaction.channelId, targetId);
  return safeReply(interaction, { content: t('ticket.memberAdded') });
}

async function removeMemberModal({ interaction, t }) {
  const targetId = interaction.fields.getTextInputValue('target');
  await ticketService.removeMember(interaction.guildId, interaction.channelId, targetId);
  return safeReply(interaction, { content: t('ticket.memberRemoved') });
}

module.exports = {
  register(handler) {
    handler.registerComponent('ticket', 'select', selectTicketType);
    handler.registerComponent('ticket', 'claim', claim);
    handler.registerComponent('ticket', 'close', close);
    handler.registerComponent('ticket', 'reopen', reopen);
    handler.registerComponent('ticket', 'delete', del);
    handler.registerComponent('ticket', 'add', makeAddRemove('add'));
    handler.registerComponent('ticket', 'remove', makeAddRemove('remove'));
    handler.registerModal('ticket', 'add', addMemberModal);
    handler.registerModal('ticket', 'remove', removeMemberModal);
  },
};

