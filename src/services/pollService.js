/**
 * PollService — button-based polls persisted in `polls`, auto-closed on a
 * timer (restored on restart). Supports multiple options, anonymous &
 * multi-select voting.
 *
 * Document shape:
 *   { id, guildId, channelId, messageId, hostId, question, options,
 *     anonymous, multi, endsAt, ended, totalVotes, createdAt }
 *   options: [{ text, voters: [userId...] }]
 */
const { getDatabase } = require('../database');
const { COLORS, LIMITS } = require('../config/constants');
const { clampInt } = require('../utils/validators');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../utils/logger');

const COLLECTION = 'polls';
let client = null;
const timers = new Map(); // id -> timer

function setClient(c) { client = c; }
function collection() { return getDatabase().collection(COLLECTION); }
function key(guildId, messageId) { return `${guildId}:${messageId}`; }

function votersOf(doc, optionIndex) {
  const opt = doc.options[optionIndex];
  if (!opt) return [];
  if (!Array.isArray(opt.voters)) opt.voters = [];
  return opt.voters;
}

function buildEmbed(doc, t = null) {
  const endsTs = Math.floor(doc.endsAt / 1000);
  const lines = doc.options.map((opt, i) => {
    const count = votersOf(doc, i).length;
    const pct = (doc.totalVotes || 0) ? Math.round((count / (doc.totalVotes || 1)) * 10) : 0;
    const bar = '█'.repeat(pct) + '░'.repeat(Math.max(0, 10 - pct));
    const label = `${String.fromCharCode(0x41 + i)}. ${opt.text}`;
    return `**${label}** — ${count} vote${count === 1 ? '' : 's'} \`${bar}\``;
  });
  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(t ? t('utility.pollQuestion', { question: doc.question }) : `📊 ${doc.question}`)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: `Ends <t:${endsTs}:R>` })
    .setTimestamp();
}

function buildButtons(doc) {
  const rows = [];
  for (let i = 0; i < doc.options.length; i++) {
    const opt = doc.options[i];
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`poll:vote:${i}`)
        .setLabel(`${String.fromCharCode(0x41 + i)}. ${opt.text}`.slice(0, 75))
        .setStyle(ButtonStyle.Secondary),
    ));
  }
  return rows;
}

/**
 * @param {object} params { guild, channel, hostId, question, options:string[], anonymous, multi, durationMs }
 */
async function create({ guild, channel, hostId, question, options, anonymous, multi, durationMs }) {
  const doc = {
    id: key(guild.id, `${Date.now()}`),
    guildId: guild.id,
    channelId: channel.id,
    messageId: null,
    hostId,
    question: String(question).slice(0, 256),
    options: options.slice(0, LIMITS.pollMaxOptions).map((text) => ({ text: String(text).slice(0, 100), voters: [] })),
    anonymous: Boolean(anonymous),
    multi: Boolean(multi),
    endsAt: Date.now() + clampInt(durationMs, LIMITS.pollMinDurationMs, LIMITS.pollMaxDurationMs, LIMITS.pollMinDurationMs),
    ended: false,
    totalVotes: 0,
    createdAt: Date.now(),
  };
  await collection().set(doc.id, doc);
  const message = await channel.send({ embeds: [buildEmbed(doc)] });
  doc.messageId = message.id;
  await message.edit({ components: buildButtons(doc) });
  await collection().set(doc.id, doc);
  arm(doc);
  return doc;
}

function arm(doc) {
  clear(doc.id);
  const delay = Math.max(1000, doc.endsAt - Date.now());
  const timer = setTimeout(() => end(doc.guildId, doc.messageId).catch((e) => logger.error('poll', `end failed: ${e.message}`)), delay);
  if (typeof timer.unref === 'function') timer.unref();
  timers.set(doc.id, timer);
}

function clear(id) {
  const t = timers.get(id);
  if (t) { clearTimeout(t); timers.delete(id); }
}

/** Register/unregister a user's vote. Returns { voted: bool }. */
async function vote(guildId, messageId, userId, optionIndex) {
  const doc = await collection().get(key(guildId, messageId));
  if (!doc || doc.ended) return null;
  if (optionIndex < 0 || optionIndex >= doc.options.length) return null;

  if (doc.multi) {
    const voters = votersOf(doc, optionIndex);
    const idx = voters.indexOf(userId);
    if (idx >= 0) voters.splice(idx, 1);
    else voters.push(userId);
  } else {
    // single choice: remove from every option, add exactly to this one
    for (let i = 0; i < doc.options.length; i++) {
      const voters = votersOf(doc, i);
      const idx = voters.indexOf(userId);
      if (idx >= 0) voters.splice(idx, 1);
    }
    votersOf(doc, optionIndex).push(userId);
  }

  doc.totalVotes = doc.options.reduce((sum, o) => sum + votersOf(doc, doc.options.indexOf(o)).length, 0);
  await collection().set(doc.id, doc);
  refreshMessage(doc);
  return { voted: true, multi: doc.multi };
}

async function refreshMessage(doc) {
  if (!client) return;
  try {
    const guild = client.guilds.cache.get(doc.guildId);
    const channel = guild ? guild.channels.cache.get(doc.channelId) : null;
    if (!channel) return;
    const message = await channel.messages.fetch(doc.messageId);
    await message.edit({ embeds: [buildEmbed(doc)] });
  } catch { /* ignore */ }
}

async function end(guildId, messageId) {
  const doc = await collection().get(key(guildId, messageId));
  if (!doc) return null;
  doc.ended = true;
  await collection().set(doc.id, doc);
  clear(doc.id);

  if (!client) return { doc, options: doc.options };
  try {
    const guild = client.guilds.cache.get(doc.guildId);
    const channel = guild ? guild.channels.cache.get(doc.channelId) : null;
    if (channel) {
      const message = await channel.messages.fetch(doc.messageId);
      const embed = new EmbedBuilder()
        .setColor(COLORS.neutral)
        .setTitle('📊 Poll ended')
        .setDescription(buildResultsText(doc))
        .setTimestamp();
      await message.edit({ embeds: [embed], components: [] });
    }
  } catch (error) {
    logger.error('poll', `end display failed: ${error.message}`);
  }
  return { doc, options: doc.options };
}

function buildResultsText(doc) {
  const total = doc.options.reduce((sum, o) => sum + (Array.isArray(o.voters) ? o.voters.length : 0), 0);
  const lines = doc.options.map((opt, i) => {
    const count = Array.isArray(opt.voters) ? opt.voters.length : 0;
    const pct = total ? Math.round((count / total) * 100) : 0;
    return `${String.fromCharCode(0x41 + i)}. ${opt.text} — ${count} (${pct}%)`;
  });
  return `**${doc.question}**\n\n${lines.join('\n')}\n\nTotal votes: **${total}**`;
}

async function get(guildId, messageId) {
  return collection().get(key(guildId, messageId));
}

async function restore(c) {
  client = c;
  const rows = await collection().find((doc) => !doc.ended);
  for (const doc of rows) {
    if (doc.endsAt <= Date.now()) end(doc.guildId, doc.messageId).catch(() => {});
    else arm(doc);
  }
  if (rows.length) logger.info('poll', `Restored ${rows.length} poll(s)`);
}

module.exports = { setClient, create, vote, end, get, buildEmbed, restore };