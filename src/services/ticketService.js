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
const i18n = require('./i18nService');
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

  // Không có types → select menu 0 option bị Discord API từ chối.
  if (!Array.isArray(panel.types) || panel.types.length === 0) {
    return { error: 'noTypes' };
  }

  const channel = panel.panelChannelId
    ? guild.channels.cache.get(panel.panelChannelId)
    : guild.systemChannel;
  if (!channel || !channel.isTextBased()) return null;

  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket:select')
    .setPlaceholder(i18n.translate(config.language, 'ticket.panelSelect'))
    .setMinValues(1).setMaxValues(1);
  for (const type of panel.types) {
    select.addOptions(
      new StringSelectMenuOptionBuilder().setLabel(String(type.label).slice(0, 100))
        .setValue(type.id).setEmoji(type.emoji || '🎫'),
    );
  }
  const row = new ActionRowBuilder().addComponents(select);
  const embed = new EmbedBuilder().setColor(COLORS.ticket)
    .setTitle(panel.panelTitle || i18n.translate(config.language, 'ticket.panelTitle'))
    .setDescription(panel.panelDescription || '')
    .setTimestamp();

  let msg;
  try {
    if (panel.panelMessageId) {
      const old = await channel.messages.fetch(panel.panelMessageId).catch(() => null);
      msg = old ? await old.edit({ embeds: [embed], components: [row] }) : await channel.send({ embeds: [embed], components: [row] });
    } else {
      msg = await channel.send({ embeds: [embed], components: [row] });
    }
  } catch (error) {
    logger.warn('tickets', `createPanel failed in ${guildId}: ${error.message}`);
    return null;
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

  // i18n: render theo ngôn ngữ của guild, không hard-code tiếng Anh.
  const t = (k, p) => i18n.translate(config.language, k, p);
  const embed = new EmbedBuilder().setColor(COLORS.ticket)
    .setTitle(t('ticket.ticketTitle', { type: type.label, user: `<@${userId}>` }))
    .setDescription(t('ticket.ticketDescription', { user: `<@${userId}>` }))
    .addFields({ name: t('common.role'), value: type.label, inline: true }, { name: t('common.user'), value: `<@${userId}>`, inline: true })
    .setFooter({ text: `Ticket #${number}` }).setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    { type: 2, style: 1, label: t('ticket.claimBtn'), customId: 'ticket:claim', emoji: '✋' },
    { type: 2, style: 2, label: t('ticket.close'), customId: 'ticket:close', emoji: '🔒' },
    { type: 2, style: 2, label: t('ticket.delete'), customId: 'ticket:delete', emoji: '🗑️' },
    { type: 2, style: 0, label: t('ticket.addBtn'), customId: 'ticket:add', emoji: '➕' },
    { type: 2, style: 0, label: t('ticket.removeBtn'), customId: 'ticket:remove', emoji: '➖' },
  );
  await channel.send({ content: `<@${userId}>`, embeds: [embed], components: [row] }).catch(() => {});

  await loggingService.sendLog(guildId, 'moderation', {
    title: t('ticket.logTitle', { number }),
    description: t('ticket.logCreated', { user: `${userId}`, type: type.label, channel: `<#${channel.id}>` }),
    color: COLORS.ticket,
  });
  return doc;
}


async function getTicketByChannel(guildId, channelId) {
  return collection().find((doc) => doc.guildId === guildId && doc.channelId === channelId);
}

function getById(guildId, number) { return collection().get(key(guildId, number)); }

/** Đổi tên + khoá/mở kênh ticket (dùng chung cho slash/prefix/button). */
async function editChannel(guildId, channelId, fn) {
  const guild = client && client.guilds.cache.get(guildId);
  const channel = guild && guild.channels.cache.get(channelId);
  if (channel) await channel.edit(fn(channel)).catch(() => {});
}

async function closeTicket(guildId, channelId, staffId) {
  const found = await getTicketByChannel(guildId, channelId);
  const doc = found[0];
  if (!doc || doc.status !== 'open') return null;
  doc.status = 'closed';
  doc.closedAt = Date.now();
  await collection().set(doc.id, doc);

  // Rename + khoá kênh: thành viên mất SendMessages, staff vẫn xem được.
  await editChannel(guildId, channelId, () => ({ name: `closed-${doc.number}-ticket` }));
  const guild = client && client.guilds.cache.get(guildId);
  const channel = guild && guild.channels.cache.get(channelId);
  if (channel) {
    const ow = channel.permissionOverwrites.cache.get(doc.userId);
    if (ow) await ow.edit({ SendMessages: false }).catch(() => {});
  }

  await loggingService.sendLog(guildId, 'moderation', {
    titleKey: 'ticket.logTitle',
    titleParams: { number: doc.number },
    description: i18n.translate((await guildConfigService.get(guildId)).language, 'ticket.logClosed', { staff: staffId, reason: '—' }),
    color: COLORS.warning,
  });
  return doc;
}

async function reopenTicket(guildId, channelId) {
  const found = await getTicketByChannel(guildId, channelId);
  const doc = found[0];
  if (!doc || doc.status !== 'closed') return null;
  doc.status = 'open';
  doc.closedAt = null;
  await collection().set(doc.id, doc);
  await editChannel(guildId, channelId, () => ({ name: `ticket-${doc.number}` }));
  const guild = client && client.guilds.cache.get(guildId);
  const channel = guild && guild.channels.cache.get(channelId);
  if (channel) {
    const ow = channel.permissionOverwrites.cache.get(doc.userId);
    if (ow) await ow.edit({ SendMessages: true }).catch(() => {});
  }
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

/** Capture messages for the transcript; saves to the logs channel if set.
 *  discord.js fetch() chỉ trả tối đa 100 tin/call — lặp cho tới khi đủ
 *  LIMITS.transcriptMaxMessages hoặc hết tin (trước đây limit 500 bị cắt
 *  thầm lặng về 100 nên transcript luôn cụt). */
async function makeTranscript(guildId, channelId) {
  if (!client) return null;
  const channel = client.guilds.cache.get(guildId)?.channels.cache.get(channelId);
  if (!channel) return null;
  try {
    const max = LIMITS.transcriptMaxMessages || 500;
    const all = [];
    let before = null;
    while (all.length < max) {
      const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
      if (!batch || batch.size === 0) break;
      all.push(...batch.values());
      before = batch.last().id;
      if (batch.size < 100) break;
    }
    const lines = all.slice(0, max).sort((a, b) => a.createdTimestamp - b.createdTimestamp).map((m) =>
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