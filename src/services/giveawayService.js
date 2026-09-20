/**
 * GiveawayService — button-based giveaways persisted in `giveaways`
 * (survive restarts via restore()). Supports multiple winners, required
 * role, minimum account age, reroll.
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getDatabase } = require('../database');
const loggingService = require('./loggingService');
const logger = require('../utils/logger');
const { COLORS, LIMITS } = require('../config/constants');

const COLLECTION = 'giveaways';
let client = null;

function setClient(c) {
  client = c;
}

function collection() {
  return getDatabase().collection(COLLECTION);
}

function key(guildId, messageId) {
  return `${guildId}:${messageId}`;
}

function buildEmbed(doc, guild) {
  const endsTs = Math.floor(doc.endsAt / 1000);
  return new EmbedBuilder()
    .setColor(COLORS.giveaway)
    .setTitle(`🎉 ${doc.prize}`)
    .setDescription([
      `Số người thắng: **${doc.winners}**`,
      `Kết thúc: <t:${endsTs}:R> (<t:${endsTs}:f>)`,
      doc.requiredRoleId ? `Yêu cầu vai trò: <@&${doc.requiredRoleId}>` : null,
      doc.minAccountAgeDays ? `Tài khoản tối thiểu: **${doc.minAccountAgeDays} ngày**` : null,
      `Người tham gia: **${doc.participants.length}**`,
    ].filter(Boolean).join('\n'))
    .setFooter({ text: 'Host: ' + (guild && doc.hostId ? (guild.members.cache.get(doc.hostId)?.user.tag || doc.hostId) : '—') })
    .setTimestamp(new Date(doc.endsAt));
}

function buildEndedEmbed(doc, winners) {
  return new EmbedBuilder()
    .setColor(COLORS.neutral)
    .setTitle(`🎉 ${doc.prize}`)
    .setDescription(winners.length
      ? '🏆 Người thắng: ' + winners.map((w) => `<@${w}>`).join(', ')
      : 'Không có người thắng.')
    .setTimestamp();
}

function scheduleEnd(guildId, messageId, endsAt) {
  const delay = Math.max(1000, endsAt - Date.now());
  const timer = setTimeout(() => {
    end(guildId, messageId).catch((e) => logger.error('giveaway', `end failed: ${e.message}`));
  }, delay);
  if (typeof timer.unref === 'function') timer.unref();
}

async function create({ guild, channel, hostId, prize, winners, durationMs, requiredRoleId = null, minAccountAgeDays = 0 }) {
  const endsAt = Date.now() + durationMs;
  const doc = {
    guildId: guild.id,
    channelId: channel.id,
    messageId: null,
    hostId,
    prize: String(prize).slice(0, 200),
    winners: Math.max(1, Math.min(LIMITS.giveawayMaxWinners, winners)),
    requiredRoleId,
    minAccountAgeDays,
    endsAt,
    participants: [],
    ended: false,
    lastWinners: [],
    createdAt: Date.now(),
  };

  const embed = buildEmbed(doc, guild);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('giveaway:join').setLabel('🎉 Tham gia').setStyle(ButtonStyle.Primary)
  );
  const message = await channel.send({ embeds: [embed], components: [row] });
  doc.messageId = message.id;
  await collection().set(key(guild.id, message.id), doc);
  scheduleEnd(guild.id, message.id, endsAt);
  return doc;
}

async function pickWinners(doc) {
  const guild = client ? client.guilds.cache.get(doc.guildId) : null;
  if (!guild) return [];
  const eligible = [];
  for (const userId of doc.participants) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;
    if (doc.requiredRoleId && !member.roles.cache.has(doc.requiredRoleId)) continue;
    if (doc.minAccountAgeDays > 0 && Date.now() - member.user.createdTimestamp < doc.minAccountAgeDays * 86400000) continue;
    eligible.push(userId);
  }
  return eligible.sort(() => Math.random() - 0.5).slice(0, doc.winners);
}

async function end(guildId, messageId, force = false) {
  const doc = await collection().get(key(guildId, messageId));
  if (!doc || doc.ended) return null;
  doc.ended = true;
  const winners = await pickWinners(doc);
  doc.lastWinners = winners;
  await collection().set(key(guildId, messageId), doc);

  const guild = client ? client.guilds.cache.get(guildId) : null;
  if (guild) {
    const channel = guild.channels.cache.get(doc.channelId);
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.giveaway)
        .setTitle(`🎉 ${doc.prize}`)
        .setDescription(winners.length
          ? '🏆 Người thắng: ' + winners.map((w) => `<@${w}>`).join(', ')
          : 'Không có người thắng (không ai tham gia). 😢')
        .setFooter({ text: 'Giveaway đã kết thúc' })
        .setTimestamp();
      try {
        await channel.send({ content: winners.map((w) => `<@${w}>`).join(' '), embeds: [embed], allowedMentions: { parse: ['users'] } });
        const original = await channel.messages.fetch(messageId).catch(() => null);
        if (original) await original.edit({ embeds: [buildEndedEmbed(doc, winners)], components: [] });
      } catch { /* missing perms */ }
    }
    for (const winnerId of winners) {
      const user = guild.members.cache.get(winnerId)?.user;
      if (user) user.send(`🎉 Chúc mừng! Bạn thắng giveaway **${doc.prize}** trong **${guild.name}**!`).catch(() => {});
    }
  }

  await loggingService.sendLog(guildId, 'moderation', {
    title: '🎉 Giveaway ended',
    description: `Prize: ${doc.prize}\nWinners: ${winners.map((w) => `<@${w}>`).join(', ') || '—'}`,
    color: COLORS.giveaway,
  });
  return { doc, winners };
}

async function reroll(guildId, messageId) {
  const doc = await collection().get(key(guildId, messageId));
  if (!doc || !doc.ended) return null;
  const previous = new Set(doc.lastWinners || []);
  const remaining = (doc.participants || []).filter((id) => !previous.has(id));
  if (!remaining.length) return null;
  const winner = remaining[Math.floor(Math.random() * remaining.length)];
  doc.lastWinners = [...(doc.lastWinners || []), winner];
  await collection().set(key(guildId, messageId), doc);
  return winner;
}

async function toggleJoin(guildId, messageId, userId) {
  const doc = await collection().get(key(guildId, messageId));
  if (!doc || doc.ended) return null;
  if (doc.participants.includes(userId)) {
    doc.participants = doc.participants.filter((id) => id !== userId);
    await collection().set(key(guildId, messageId), doc);
    return 'left';
  }
  doc.participants.push(userId);
  await collection().set(key(guildId, messageId), doc);
  if (client) {
    const guild = client.guilds.cache.get(guildId);
    const channel = guild ? guild.channels.cache.get(doc.channelId) : null;
    const message = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
    if (message && message.embeds.length) {
      await message.edit({ embeds: [buildEmbed(doc, guild)] }).catch(() => {});
    }
  }
  return 'joined';
}

async function get(guildId, messageId) {
  return collection().get(key(guildId, messageId));
}

async function listActive(guildId) {
  return collection().find((doc) => doc.guildId === guildId && !doc.ended);
}

async function restore(c) {
  client = c;
  const rows = await collection().find((doc) => !doc.ended);
  for (const doc of rows) {
    if (doc.endsAt <= Date.now()) end(doc.guildId, doc.messageId).catch(() => {});
    else scheduleEnd(doc.guildId, doc.messageId, doc.endsAt);
  }
  if (rows.length) logger.info('giveaway', `Restored ${rows.length} active giveaway(s)`);
}

module.exports = { setClient, create, end, reroll, toggleJoin, get, listActive, restore };
