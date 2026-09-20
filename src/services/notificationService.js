/**
 * NotificationService — posts to a guild channel when an external feed
 * (YouTube / Twitch / RSS) publishes a new item. (spec §15)
 *
 * Sources are polled on a fixed interval; lastSeen etag/id de-dupes posts.
 * restore() starts the poller after a restart.
 *
 * Collection `notifications` doc:
 *   { id:"<guildId>:<type>:<sourceId>", guildId, type, sourceId, channelId,
 *     template, pingRoleId, lastSeen, createdAt }
 */
const { getDatabase } = require('../database');
const { COLORS } = require('../config/constants');
const config = require('../config/config');
const logger = require('../utils/logger');

const COLLECTION = 'notifications';
const POLL_INTERVAL = 90_000; // 1.5 min
let client = null;
let interval = null;

function setClient(c) { client = c; }
function collection() { return getDatabase().collection(COLLECTION); }
function key(guildId, type, sourceId) { return `${guildId}:${type}:${sourceId}`; }

async function add(guildId, type, sourceId, channelId, template, pingRoleId) {
  const doc = { id: key(guildId, type, sourceId), guildId: String(guildId), type, sourceId, channelId, template, pingRoleId: pingRoleId || null, lastSeen: '', createdAt: Date.now() };
  await collection().set(doc.id, doc);
  return doc;
}

async function remove(guildId, type, sourceId) {
  await collection().delete(key(guildId, type, sourceId));
}

async function list(guildId) {
  const rows = await collection().find((doc) => doc.guildId === String(guildId));
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

/** Minimal feed fetcher: YouTube RSS (no key), Twitch eventSub, RSS/Atom. */
async function fetchItems(type, sourceId) {
  try {
    let url;
    if (type === 'youtube') url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(sourceId)}`;
    else if (type === 'twitch') url = `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(sourceId)}`;
    else url = sourceId; // raw RSS/Atom URL

    const headers = {};
    if (type === 'twitch' && config.twitch.clientId) {
      headers['Client-ID'] = config.twitch.clientId;
      const token = await fetchTwitchToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const text = await res.text();
    if (type === 'twitch') {
      const data = JSON.parse(text);
      return (data.data || []).map((s) => ({ id: s.id, title: s.title, link: `https://twitch.tv/${s.user_login}` }));
    }
    return parseFeedXml(text);
  } catch (error) {
    logger.error('notify', `fetch ${type} failed: ${error.message}`);
    return [];
  }
}

async function fetchTwitchToken() {
  if (!config.twitch.clientId || !config.twitch.clientSecret) return null;
  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token?client_id=' + config.twitch.clientId + '&client_secret=' + config.twitch.clientSecret + '&grant_type=client_credentials');
    const data = await res.json();
    return data.access_token;
  } catch {
    return null;
  }
}

/** Very small RSS/Atom → items parser (no external dependency). */
function parseFeedXml(text) {
  const items = [];
  const entryRe = /<entry[\s>]([\s\S]*?)<\/entry>/g;
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/g;
  let m;
  while ((m = entryRe.exec(text)) !== null) items.push(parseEntry(m[1]));
  while ((m = itemRe.exec(text)) !== null) items.push(parseEntry(m[1]));
  return items.filter((i) => i.id).slice(0, 5);
}

function parseEntry(xml) {
  const text = (tag) => { const r = new RegExp('<' + tag + '[^>]*>([^<]*)</' + tag + '>').exec(xml); return r ? r[1].trim() : ''; };
  return { id: text('id') || text('guid'), title: text('title'), link: text('link') || text('url') };
}

async function checkAll() {
  if (!client) return;
  const rows = await collection().all();
  for (const doc of rows) {
    try {
      const items = await fetchItems(doc.type, doc.sourceId);
      for (const item of items) {
        if (doc.lastSeen && item.id <= doc.lastSeen) continue;
        const guild = client.guilds.cache.get(doc.guildId);
        if (!guild) continue;
        const channel = guild.channels.cache.get(doc.channelId);
        if (!channel?.isTextBased()) continue;
        const template = doc.template || '{title}\n{link}';
        const content = template.replace(/{title}/g, item.title || '').replace(/{link}/g, item.link || '');
        const payload = { content: doc.pingRoleId ? `<@&${doc.pingRoleId}> ${content}` : content, allowedMentions: doc.pingRoleId ? { roles: [doc.pingRoleId] } : { parse: [] } };
        await channel.send(payload).catch(() => {});
      }
      if (items.length) { doc.lastSeen = items[0].id; await collection().set(doc.id, doc); }
    } catch (error) {
      logger.error('notify', `check ${doc.id} failed: ${error.message}`);
    }
  }
}

function restore(c = client) {
  client = c;
  if (interval) clearInterval(interval);
  const safeCheck = () => checkAll().catch((e) => logger.error('notify', `poll failed: ${e.message}`));
  safeCheck();
  interval = setInterval(safeCheck, POLL_INTERVAL);
  if (typeof interval.unref === 'function') interval.unref();
  logger.info('notify', 'Poller started');
}

function stop() { if (interval) clearInterval(interval); }

module.exports = { setClient, add, remove, list, restore, stop, _checkAll: checkAll };
