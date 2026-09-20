/**
 * TicketService — support tickets created via a select panel.
 * Tickets live as private text channels; transcripts are saved on delete. (spec §7)
 *
 * Guild config (guildDefaults.tickets):
 *   { enabled, panelChannelId, panelMessageId, logsChannelId,
 *     types: [{ id, label, emoji, categoryId, staffRoleIds }] }
 * Collection `tickets` doc:
 *   { id:"<guildId>:<n>", guildId, channelId, typeId, typeLabel, userId,
 *     status:'open'|'closed', claimedBy, number, createdAt, closedAt }
 */
const { getDatabase } = require('../database');
const guildConfigService = require('./guildConfigService');
const loggingService = require('./loggingService');
const { COLORS, LIMITS } = require('../config/constants');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');

const COLLECTION = 'tickets';
let client = null;

function setClient(c) { client = c; }
function collection() { return getDatabase().collection(COLLECTION); }
function key(guildId, number) { return `${guildId}:${number}`; }

async function nextNumber() {
  const counter = getDatabase().collection('counters');
  const doc = (await counter.get('tickets')) || { seq: 0 };
  doc.seq = (doc.seq || 0) + 1;
  await counter.set('tickets', doc);
  return doc.seq;
}

/** Build the ticket-creation panel (select menu) and (re)send it. */
async function createPanel(guildId) {
  if (!client) return null;
  const config = await guildConfigService.get(guildId);
  const panel = config.tickets;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  const channel = panel.panelChannelId
    ? guild.channels.cache.get(panel.panelChannelId)
    : guild.systemChannel;
  if (!channel || !channel.isTextBased()) return null;

  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket:select').setPlaceholder('Choose a ticket type…')
    .setMinValues(1).setMaxValues(1);
  for (const type of panel.types || []) {
    select.addOptions(
      new StringSelectMenuOptionBuilder().setLabel(String(type.label).slice(0, 100))
        .setValue(type.id).setEmoji(type.emoji || '🎫'),
    );
  }
  const row = new ActionRowBuilder().addComponents(select);
  const embed = new EmbedBuilder().setColor(COLORS.ticket)
    .setTitle(panel.panelTitle || '🎫 Create Ticket')
    .setDescription(panel.panelDescription || 'Select a ticket type below to open a private channel with staff.')
    .setTimestamp();

  let msg;
  if (panel.panelMessageId) {
    try { const old = await channel.messages.fetch(panel.panelMessageId).catch(() => null); if (old) await old.edit({ embeds: [embed], components: [row] }); else msg = await channel.send({ embeds: [embed], components: [row] }); }
    catch { msg = await channel.send({ embeds: [embed], components: [row] }); }
  } else {
    msg = await channel.send({ embeds: [embed], components: [row] });
  }
  if (msg) await guildConfigService.update(guildId, { 'tickets.panelMessageId': msg.id });
  return channel;
}


async function openTicket(guildId, userId, typeId) {
  if (!client) return null;
  const config = await guildConfigService.get(guildId);
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  const type = (config.tickets.types || []).find((t) => t.id === typeId);
  if (!type) return { error: 'typeNotFound' };

  const existing = await collection().find((doc) => doc.guildId === guildId && doc.userId === userId && doc.status === 'open');
  if (existing.length >= LIMITS.ticketMaxPerUser) return { error: 'maxReached', existing: existing[0] };

  const number = await nextNumber();
  const category = type.categoryId ? await guild.channels.fetch(type.categoryId).catch(() => null) : null;
  const staffRoleIds = type.staffRoleIds || [];
  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ...staffRoleIds.map((roleId) => ({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] })),
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];

  const channel = await guild.channels.create({
    name: `ticket-${number}`, type: 0, parent: category ? category.id : undefined,
    topic: `Ticket #${number} | Type: ${type.label} | User: ${userId}`, permissionOverwrites: overwrites,
  }).catch(() => null);
  if (!channel) return { error: 'channelFailed' };

  const doc = { id: key(guildId, number), guildId, channelId: channel.id, typeId, typeLabel: type.label, userId, status: 'open', claimedBy: null, number, createdAt: Date.now(), closedAt: null };
  await collection().set(doc.id, doc);

  const embed = new EmbedBuilder().setColor(COLORS.ticket)
    .setTitle(`🎫 ${type.label} Ticket — #${number}`)
    .setDescription(`Hi <@${userId}>, a staff member will be with you shortly.\nPlease describe your issue here.`)
    .addFields({ name: 'Type', value: type.label, inline: true }, { name: 'Owner', value: `<@${userId}>`, inline: true })
    .setFooter({ text: `Ticket #${number}` }).setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    { type: 2, style: 1, label: 'Claim', customId: 'ticket:claim', emoji: '✋' },
    { type: 2, style: 2, label: 'Close', customId: 'ticket:close', emoji: '🔒' },
    { type: 2, style: 2, label: 'Delete', customId: 'ticket:delete', emoji: '🗑️' },
    { type: 2, style: 0, label: 'Add', customId: 'ticket:add', emoji: '➕' },
    { type: 2, style: 0, label: 'Remove', customId: 'ticket:remove', emoji: '➖' },
  );
  await channel.send({ content: `<@${userId}>`, embeds: [embed], components: [row] }).catch(() => {});

  await loggingService.sendLog(guildId, 'moderation', {
    title: `🎫 Ticket #${number} opened`,
    description: `**Type:** ${type.label}\n**User:** <@${userId}> (${userId})\n**Channel:** ${channel}`,
    color: COLORS.ticket,
  });
  return doc;
}


async function getTicketByChannel(guildId, channelId) {
  return collection().find((doc) => doc.guildId === guildId && doc.channelId === channelId);
}

function getById(guildId, number) { return collection().get(key(guildId, number)); }

async function closeTicket(guildId, channelId, staffId) {
  const found = await getTicketByChannel(guildId, channelId);
  const doc = found[0];
  if (!doc || doc.status !== 'open') return null;
  doc.claimedBy = doc.claimedBy || staffId;
  doc.status = 'closed';
  doc.closedAt = Date.now();
  await collection().set(doc.id, doc);
  return doc;
}

async function reopenTicket(guildId, channelId) {
  const found = await getTicketByChannel(guildId, channelId);
  const doc = found[0];
  if (!doc || doc.status !== 'closed') return null;
  doc.status = 'open';
  doc.closedAt = null;
  await collection().set(doc.id, doc);
  return doc;
}

async function claimTicket(guildId, channelId, staffId) {
  const found = await getTicketByChannel(guildId, channelId);
  const doc = found[0];
  if (!doc || doc.status !== 'open') return null;
  doc.claimedBy = staffId;
  await collection().set(doc.id, doc);
  return doc;
}


async function addMember(guildId, channelId, targetId) {
  const found = await getTicketByChannel(guildId, channelId);
  if (!found[0]) return null;
  const channel = client.guilds.cache.get(guildId)?.channels.cache.get(channelId);
  if (channel) await channel.permissionOverwrites.create(targetId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
  return true;
}

async function removeMember(guildId, channelId, targetId) {
  const found = await getTicketByChannel(guildId, channelId);
  if (!found[0]) return null;
  const channel = client.guilds.cache.get(guildId)?.channels.cache.get(channelId);
  if (channel) {
    const ow = channel.permissionOverwrites.cache.get(targetId);
    if (ow) await ow.delete().catch(() => {});
  }
  return true;
}

/** Capture up to transcriptMaxMessages messages; save to logs channel if set. */
async function makeTranscript(guildId, channelId) {
  if (!client) return null;
  const channel = client.guilds.cache.get(guildId)?.channels.cache.get(channelId);
  if (!channel) return null;
  try {
    const fetched = await channel.messages.fetch({ limit: LIMITS.transcriptMaxMessages || 500 });
    const lines = fetched.reverse().map((m) =>
      `[${new Date(m.createdTimestamp).toISOString()}] ${m.author?.tag || 'unknown'}: ${m.cleanContent}`,
    ).filter(Boolean);
    const config = await guildConfigService.get(guildId);
    const logChannelId = config.tickets.logsChannelId;
    if (logChannelId) {
      const logChannel = client.guilds.cache.get(guildId)?.channels.cache.get(logChannelId);
      if (logChannel?.isTextBased()) {
        const embed = new EmbedBuilder().setColor(COLORS.neutral).setTitle('📜 Ticket transcript').setTimestamp();
        embed.setDescription('```' + lines.join('\n').slice(0, 4000) + '```');
        const msg = await logChannel.send({ embeds: [embed] }).catch(() => null);
        return { link: msg?.url || null, id: msg?.id || null, lines };
      }
    }
    return { lines, count: lines.length };
  } catch {
    return null;
  }
}

async function deleteTicket(guildId, channelId, staffId) {
  const transcript = await makeTranscript(guildId, channelId);
  const found = await getTicketByChannel(guildId, channelId);
  for (const d of found) await collection().delete(d.id);
  const channel = client.guilds.cache.get(guildId)?.channels.cache.get(channelId);
  if (channel) channel.delete(`Ticket deleted by ${staffId}`).catch(() => {});
  await loggingService.sendLog(guildId, 'moderation', {
    title: '🗑️ Ticket deleted',
    description: transcript ? `**Transcript:** ${transcript.link || transcript.id || 'saved'}` : '(no transcript)',
    color: COLORS.error,
  });
  return transcript;
}

function isTicketChannel(guildId, channelId) {
  return getTicketByChannel(guildId, channelId).then((found) => found.length > 0);
}

/** All open tickets (status==='open') for a guild. */
async function listOpen(guildId) {
  const rows = await collection().find((doc) => doc.guildId === guildId && doc.status === 'open');
  return rows.sort((a, b) => (a.number || 0) - (b.number || 0));
}

module.exports = {
  setClient, createPanel, openTicket, claimTicket, closeTicket, reopenTicket,
  deleteTicket, addMember, removeMember, makeTranscript, getTicketByChannel, getById, isTicketChannel,
  listOpen,
};