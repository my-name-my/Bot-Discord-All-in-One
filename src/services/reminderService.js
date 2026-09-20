/**
 * ReminderService — persisted per-user reminders (`reminders` collection).
 * Reminders survive restarts: restore() re-schedules every future timer.
 *
 * Document shape:
 *   { id, guildId, channelId, userId, text, endsAt, createdAt }
 *
 * Reminder ids are unique strings; the public list/remove API exposes a
 * per-user 1-based ordinal (sorted by createdAt) so users just say "remind
 * list" then "remind delete <number>".
 */
const { getDatabase } = require('../database');
const { COLORS } = require('../config/constants');
const logger = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');

const COLLECTION = 'reminders';
let client = null;
const timers = new Map(); // id -> { timer, doc }
let counter = 0;

function setClient(c) { client = c; }
function collection() { return getDatabase().collection(COLLECTION); }

function newId() {
  counter = (counter + 1) % 1e6;
  return `${Date.now()}:${counter}:${Math.random().toString(36).slice(2, 6)}`;
}

/** @returns {Promise<object>} created reminder doc */
async function create({ guildId, channelId, userId, text }) {
  const doc = {
    id: newId(),
    guildId: String(guildId),
    channelId: String(channelId),
    userId: String(userId),
    text: String(text).slice(0, 1000),
    endsAt: 0,
    createdAt: Date.now(),
  };
  await collection().set(doc.id, doc);
  return doc;
}

/**
 * Finalise a reminder: validate duration, persist and schedule the fire timer.
 * Split from create() so prefix commands can validate before scheduling.
 */
async function schedule(guildId, channelId, userId, text, durationMs) {
  if (!durationMs || durationMs <= 0) return null;
  const doc = await create({ guildId, channelId, userId, text });
  doc.endsAt = Date.now() + durationMs;
  await collection().set(doc.id, doc);
  arm(doc);
  return doc;
}

function arm(doc) {
  clear(doc.id);
  const delay = Math.max(1, doc.endsAt - Date.now());
  const timer = setTimeout(() => fire(doc), delay);
  if (typeof timer.unref === 'function') timer.unref();
  timers.set(doc.id, { timer, doc });
}

function clear(id) {
  const entry = timers.get(id);
  if (entry) {
    clearTimeout(entry.timer);
    timers.delete(id);
  }
}

async function fire(doc) {
  clear(doc.id);
  try {
    const guild = client ? client.guilds.cache.get(doc.guildId) : null;
    const user = client ? client.users.cache.get(doc.userId) : null;
    if (guild && user) {
      const channel = guild.channels.cache.get(doc.channelId);
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('⏰ Reminder!')
        .setDescription(doc.text)
        .setTimestamp();
      if (channel && channel.isTextBased()) {
        await channel.send({ content: `<@${doc.userId}>`, embeds: [embed], allowedMentions: { users: [doc.userId] } });
      } else {
        await user.send({ embeds: [embed] }).catch(() => {});
      }
    }
  } catch (error) {
    logger.error('reminder', `fire failed: ${error.message}`);
  } finally {
    await collection().delete(doc.id).catch(() => {});
  }
}

/** Per-user list, newest first. */
async function list(userId) {
  const rows = await collection().find((doc) => doc.userId === String(userId));
  return rows
    .filter((doc) => doc.endsAt > Date.now())
    .sort((a, b) => a.endsAt - b.endsAt)
    .map((doc, index) => ({ ...doc, number: index + 1 }));
}

/** Remove by 1-based ordinal; returns true when removed. */
async function remove(userId, ordinal) {
  const listDoc = await list(userId);
  const target = listDoc.find((r) => r.number === ordinal);
  if (!target) return false;
  clear(target.id);
  await collection().delete(target.id);
  return true;
}

async function restore(c) {
  client = c;
  const now = Date.now();
  const rows = await collection().find((doc) => doc.endsAt && doc.endsAt > now);
  for (const doc of rows) arm(doc);
  if (rows.length) logger.info('reminder', `Restored ${rows.length} reminder(s)`);
}

module.exports = { setClient, create, schedule, list, remove, restore };
