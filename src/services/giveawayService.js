/**
 * GiveawayService — button-based giveaways persisted in `giveaways`
 * (survive restarts via restore()). Supports multiple winners, required
 * role, minimum account age, reroll.
 *
 * Mọi mutation read-modify-write (join/leave/end/reroll) chạy dưới mutex theo
 * message: trước đây 2 cú click gần nhau cùng đọc doc cũ rồi ghi đè nên có
 * thể sinh entry trùng hoặc nuốt entry của người khác.
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getDatabase } = require('../database');
const loggingService = require('./loggingService');
const guildConfigService = require('./guildConfigService');
const i18n = require('./i18nService');
const logger = require('../utils/logger');
const { COLORS, LIMITS } = require('../config/constants');

const COLLECTION = 'giveaways';
const MAX_ACCOUNT_AGE_DAYS = LIMITS.giveawayMaxAccountAgeDays;
const locks = new Map(); // `${guildId}:${messageId}` → tail promise
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

/** Serialise read-modify-write trên cùng 1 giveaway (mirror economyService). */
async function withGiveawayLock(lockKey, fn) {
  const prev = locks.get(lockKey) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  locks.set(lockKey, prev.then(() => gate));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    // Chỉ xoá khi tail vẫn là gate của mình (không ai xếp hàng phía sau).
    if (locks.get(lockKey) === gate) locks.delete(lockKey);
  }
}

/**
 * Tuỳ chọn hành vi theo guild (config.giveaways): ngôn ngữ hiển thị + role ping
 * khi mở giveaway. `pingRoleId` trước đây có trong config nhưng không nơi nào
 * đọc. Command truyền `ctx.language` xuống; các luồng không có context (timer
 * end / restore / nút join) để `lang = null` và service tự lấy từ guild config
 * (guildConfigService có TTL cache 30s nên chi phí không đáng kể).
 * @param {string} guildId
 * @param {string|null} [lang]
 * @returns {Promise<{ language: string|null, pingRoleId: string|null }>}
 */
async function guildOptions(guildId, lang) {
  const fallback = { language: lang || null, pingRoleId: null };
  try {
    const cfg = await guildConfigService.get(guildId);
    return {
      language: lang || cfg.language || null,
      pingRoleId: (cfg.giveaways && cfg.giveaways.pingRoleId) || null,
    };
  } catch {
    return fallback;
  }
}

/**
 * Embed giveaway đang chạy. Toàn bộ nhãn đi qua i18n — trước đây hard-code
 * tiếng Việt nên guild đặt `language: en` vẫn nhận embed tiếng Việt.
 * @param {object} doc
 * @param {import('discord.js').Guild|null} guild
 * @param {string|null} lang
 */
function buildEmbed(doc, guild, lang) {
  const endsTs = Math.floor(doc.endsAt / 1000);
  const hostTag = guild && doc.hostId
    ? (guild.members.cache.get(doc.hostId)?.user?.tag || doc.hostId)
    : '—';
  const description = [
    i18n.translate(lang, 'giveaway.embedWinners', { count: doc.winners }),
    i18n.translate(lang, 'giveaway.embedEnds', { relative: `<t:${endsTs}:R>`, absolute: `<t:${endsTs}:f>` }),
    doc.requiredRoleId ? i18n.translate(lang, 'giveaway.embedRequiredRole', { role: `<@&${doc.requiredRoleId}>` }) : null,
    doc.minAccountAgeDays ? i18n.translate(lang, 'giveaway.embedMinAge', { days: doc.minAccountAgeDays }) : null,
    i18n.translate(lang, 'giveaway.entries', { count: doc.participants.length }),
  ].filter(Boolean).join('\n');
  return new EmbedBuilder()
    .setColor(COLORS.giveaway)
    .setTitle(`🎉 ${doc.prize}`)
    .setDescription(description)
    .setFooter({ text: i18n.translate(lang, 'giveaway.embedHost', { host: hostTag }) })
    .setTimestamp(new Date(doc.endsAt));
}

/** Embed công bố kết quả — dùng cho cả tin nhắn mới lẫn tin gốc được edit lại. */
function buildEndedEmbed(doc, winners, lang) {
  const title = i18n.translate(lang, 'giveaway.endedTitle', { prize: doc.prize });
  const description = winners.length
    ? i18n.translate(lang, 'giveaway.winnerLine', { winners: winners.map((w) => `<@${w}>`).join(', ') })
    : i18n.translate(lang, 'giveaway.noWinner');
  return new EmbedBuilder()
    .setColor(COLORS.giveaway)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: i18n.translate(lang, 'giveaway.ended') })
    .setTimestamp();
}

function scheduleEnd(guildId, messageId, endsAt) {
  const delay = Math.max(1000, endsAt - Date.now());
  const timer = setTimeout(() => {
    end(guildId, messageId).catch((e) => logger.error('giveaway', `end failed: ${e.message}`));
  }, delay);
  if (typeof timer.unref === 'function') timer.unref();
}

/** Member đã resolve (cache miss → fetch). null khi đã rời server. */
async function fetchMember(guild, userId) {
  if (!guild) return null;
  const cached = guild.members.cache.get(userId);
  if (cached) return cached;
  return guild.members.fetch(userId).catch(() => null);
}

/**
 * Điều kiện tham gia — dùng chung cho lúc JOIN và lúc QUAY SỐ, nên người thiếu
 * role / tài khoản quá mới vừa bị chặn ngay khi bấm nút, vừa không thể lọt vào
 * danh sách winner.
 * @param {import('discord.js').GuildMember|null} member
 * @param {object} doc
 * @returns {{ ok: boolean, status?: string, params?: object }} `status` là hậu tố
 *   của key i18n `giveaway.<status>` để nơi gọi đọc thẳng ra thông báo.
 */
function eligibility(member, doc) {
  if (!member) return { ok: false, status: 'memberLeft' };
  if (doc.requiredRoleId && !member.roles.cache.has(doc.requiredRoleId)) {
    return { ok: false, status: 'notEligibleRole', params: { role: `<@&${doc.requiredRoleId}>` } };
  }
  if (doc.minAccountAgeDays > 0
    && Date.now() - member.user.createdTimestamp < doc.minAccountAgeDays * 86400000) {
    return { ok: false, status: 'notEligibleAge', params: { days: doc.minAccountAgeDays } };
  }
  return { ok: true };
}

/** Id những người tham gia còn đủ điều kiện (giữ nguyên thứ tự gốc). */
async function eligibleParticipants(doc, guild) {
  const out = [];
  for (const userId of doc.participants || []) {
    const member = await fetchMember(guild, userId);
    if (member && eligibility(member, doc).ok) out.push(userId);
  }
  return out;
}

async function create({ guild, channel, hostId, prize, winners, durationMs, requiredRoleId = null, minAccountAgeDays = 0, lang = null }) {
  const { language, pingRoleId } = await guildOptions(guild.id, lang);
  const endsAt = Date.now() + durationMs;
  const doc = {
    guildId: guild.id,
    channelId: channel.id,
    messageId: null,
    hostId,
    prize: String(prize).replace(/\s+/g, ' ').trim().slice(0, 200),
    winners: Math.max(1, Math.min(LIMITS.giveawayMaxWinners, Math.trunc(winners) || 1)),
    requiredRoleId,
    minAccountAgeDays: Math.max(0, Math.min(MAX_ACCOUNT_AGE_DAYS, Math.trunc(minAccountAgeDays) || 0)),
    endsAt,
    participants: [],
    ended: false,
    lastWinners: [],
    createdAt: Date.now(),
  };

  // Trước đây nhãn nút gọi i18n.translate(lang, ...) khi `lang` chưa hề được
  // khai báo trong hàm → ReferenceError, khiến /giveaway create luôn báo lỗi.
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('giveaway:join')
      .setLabel(i18n.translate(language, 'giveaway.button'))
      .setStyle(ButtonStyle.Primary)
  );
  const message = await channel.send({
    content: pingRoleId ? `<@&${pingRoleId}>` : null,
    embeds: [buildEmbed(doc, guild, language)],
    components: [row],
    // Chỉ ping đúng role đã cấu hình, không cho phép mention lan.
    allowedMentions: pingRoleId ? { roles: [pingRoleId], parse: [] } : { parse: [] },
  });
  doc.messageId = message.id;
  await collection().set(key(guild.id, message.id), doc);
  scheduleEnd(guild.id, message.id, endsAt);
  return doc;
}

async function pickWinners(doc) {
  const guild = client ? client.guilds.cache.get(doc.guildId) : null;
  if (!guild) return [];
  return shuffle(await eligibleParticipants(doc, guild)).slice(0, doc.winners);
}

/** Fisher-Yates shuffle tránh bias non-uniform của sort(() => Math.random() - .5). */
function shuffle(array) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function end(guildId, messageId) {
  return withGiveawayLock(key(guildId, messageId), async () => {
    const doc = await collection().get(key(guildId, messageId));
    if (!doc || doc.ended) return null;
    const lang = (await guildOptions(guildId)).language;
    const winners = await pickWinners(doc);
    doc.ended = true;
    doc.endedAt = Date.now();
    doc.lastWinners = winners;
    await collection().set(key(guildId, messageId), doc);

    const guild = client ? client.guilds.cache.get(guildId) : null;
    if (guild) {
      const channel = guild.channels.cache.get(doc.channelId);
      if (channel && channel.isTextBased()) {
        try {
          // Cùng 1 embed cho tin nhắn công bố và tin gốc được edit lại — trước
          // đây 2 nhánh tự dựng embed riêng nên nội dung bị lệch nhau.
          const announce = buildEndedEmbed(doc, winners, lang);
          await channel.send({
            content: winners.length ? winners.map((w) => `<@${w}>`).join(' ') : null,
            embeds: [announce],
            allowedMentions: { parse: ['users'] },
          });
          const original = await channel.messages.fetch(messageId).catch(() => null);
          if (original) await original.edit({ embeds: [announce], components: [] });
        } catch { /* missing perms */ }
      }
      for (const winnerId of winners) {
        const member = guild.members.cache.get(winnerId);
        if (member) {
          member.send(i18n.translate(lang, 'giveaway.congratsDm', { prize: doc.prize, server: guild.name }))
            .catch(() => {});
        }
      }
    }

    await loggingService.sendLog(guildId, 'moderation', {
      titleKey: 'giveaway.endedTitle',
      titleParams: { prize: doc.prize },
      description: i18n.translate(lang, 'giveaway.logWinners', {
        winners: winners.map((w) => `<@${w}>`).join(', ') || '—',
      }),
      color: COLORS.giveaway,
    });
    return { doc, winners };
  });
}

async function reroll(guildId, messageId) {
  return withGiveawayLock(key(guildId, messageId), async () => {
    const doc = await collection().get(key(guildId, messageId));
    if (!doc || !doc.ended) return null;
    const guild = client ? client.guilds.cache.get(guildId) : null;
    const previous = new Set(doc.lastWinners || []);
    // Chỉ quay trong số người CÒN đủ điều kiện và chưa từng thắng — trước đây
    // chỉ loại người thắng cũ nên người thiếu role vẫn có thể được chọn lại.
    const pool = (await eligibleParticipants(doc, guild)).filter((id) => !previous.has(id));
    if (!pool.length) return null;
    const winner = shuffle(pool)[0];
    doc.lastWinners = [...(doc.lastWinners || []), winner];
    await collection().set(key(guildId, messageId), doc);
    return winner;
  });
}

/** Vẽ lại embed của tin gốc để số người tham gia luôn khớp DB. */
async function refreshEmbed(guild, doc, messageId, lang) {
  if (!guild) return;
  const channel = guild.channels.cache.get(doc.channelId);
  if (!channel || !channel.isTextBased()) return;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message || !message.embeds.length) return;
  const language = lang || (await guildOptions(doc.guildId)).language;
  await message.edit({ embeds: [buildEmbed(doc, guild, language)] }).catch(() => {});
}

/**
 * Đảo trạng thái tham gia. Trả về `{ status, params }` với `status` ∈
 * `joined | left | notFound | ended | notEligibleRole | notEligibleAge | memberLeft`
 * (interaction đọc thẳng thành key `giveaway.<status>`).
 *
 * Trước đây hàm này bỏ qua hoàn toàn điều kiện tham gia nên người thiếu role
 * vẫn join được, và nhánh rời giveaway không vẽ lại embed.
 */
async function toggleJoin(guildId, messageId, userId) {
  return withGiveawayLock(key(guildId, messageId), async () => {
    const doc = await collection().get(key(guildId, messageId));
    if (!doc) return { status: 'notFound' };
    if (doc.ended) return { status: 'ended' };

    const guild = client ? client.guilds.cache.get(guildId) : null;
    const index = doc.participants.indexOf(userId);
    if (index !== -1) {
      doc.participants.splice(index, 1);
      await collection().set(key(guildId, messageId), doc);
      await refreshEmbed(guild, doc, messageId);
      return { status: 'left' };
    }

    if (guild) {
      const member = await fetchMember(guild, userId);
      const check = eligibility(member, doc);
      if (!check.ok) return { status: check.status, params: check.params };
    }

    doc.participants.push(userId);
    await collection().set(key(guildId, messageId), doc);
    await refreshEmbed(guild, doc, messageId);
    return { status: 'joined' };
  });
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
    if (doc.endsAt <= Date.now()) {
      end(doc.guildId, doc.messageId).catch((e) => logger.error('giveaway', `restore end failed: ${e.message}`));
    } else {
      scheduleEnd(doc.guildId, doc.messageId, doc.endsAt);
    }
  }
  if (rows.length) logger.info('giveaway', `Restored ${rows.length} active giveaway(s)`);
}

module.exports = { setClient, create, end, reroll, toggleJoin, get, listActive, restore };
