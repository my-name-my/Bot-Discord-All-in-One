/**
 * Per-guild configuration service. Each guild has an isolated document in
 * the `guilds` collection, deep-merged over models/guildDefaults.
 * A 30s TTL cache keeps hot paths (every message) fast.
 */
const { getDatabase } = require('../database');
const defaults = require('../models/guildDefaults');
const { deepMerge, clone } = require('../utils/objects');

const COLLECTION = 'guilds';
const CACHE_TTL = 30 * 1000;

const cache = new Map(); // guildId → { config, expires }

function collection() {
  return getDatabase().collection(COLLECTION);
}

function defaultConfig() {
  return clone(defaults);
}

/**
 * @param {string} guildId
 * @returns {Promise<object>} merged config (defaults + stored overrides)
 */
async function get(guildId) {
  if (!guildId) return defaultConfig();
  const cached = cache.get(guildId);
  if (cached && cached.expires > Date.now()) return cached.config;

  const stored = (await collection().get(guildId)) || {};
  const merged = deepMerge(defaultConfig(), stored);
  cache.set(guildId, { config: merged, expires: Date.now() + CACHE_TTL });
  return merged;
}

/**
 * Persist a partial update (shallow paths are fine — merged at read time).
 * @param {string} guildId
 * @param {object} patch e.g. { prefix: '?', 'welcome.channelId': '123' }
 */
async function update(guildId, patch) {
  const stored = (await collection().get(guildId)) || {};

  for (const [key, value] of Object.entries(patch)) {
    const parts = key.split('.');
    let node = stored;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }

  await collection().set(guildId, stored);
  cache.delete(guildId);
  return get(guildId);
}

/** Ensure a document exists (called on guildCreate / first use). */
async function ensure(guildId) {
  if (!(await collection().get(guildId))) {
    await collection().set(guildId, {});
  }
}

async function remove(guildId) {
  await collection().delete(guildId);
  cache.delete(guildId);
}

function invalidate(guildId) {
  cache.delete(guildId);
}

module.exports = { get, update, ensure, remove, invalidate, defaultConfig };
