/**
 * Context thực thi chung cho cả đường slash và prefix.
 * Logic nghiệp vụ của lệnh chỉ viết MỘT lần dựa trên class này.
 */
const { MessageFlags } = require('discord.js');
const i18n = require('../services/i18nService');
const embeds = require('../utils/embeds');
const config = require('../config/config');
const { parseDuration } = require('../utils/time');

class Context {
  /**
   * @param {object} params các tham số
   * @param {Client} params.client client Discord
   * @param {object} params.command định nghĩa lệnh
   * @param {'slash'|'prefix'} params.source nguồn gọi
   * @param {CommandInteraction|null} params.interaction tương tác slash
   * @param {Message|null} params.message tin nhắn prefix
   * @param {object} params.options giá trị option đã resolve theo tên
   * @param {object} [params.members] GuildMember đã resolve theo tên option
   * @param {object|null} [params.subcommand] định nghĩa subcommand đang chạy
   * @param {string|null} [params.language] ngôn ngữ server
   * @param {object|null} [params.guildConfig] cấu hình server
   * @param {string} [params.prefix] tiền tố
   */
  constructor({ client, command, source, interaction = null, message = null, options = {}, members = {}, subcommand = null, language = null, guildConfig = null, prefix = null }) {
    this.client = client;
    this.command = command;
    this.source = source;
    this.interaction = interaction;
    this.message = message;
    this.options = options;
    this.members = members;
    this.subcommand = subcommand;
    this.language = language || config.defaultLanguage;
    this.guildConfig = guildConfig;
    this.prefix = prefix;
    this.deferred = false;
    this.replied = false;
    this.sentMessage = null;

    if (interaction) {
      this.guild = interaction.guild || null;
      this.member = interaction.member || null;
      this.user = interaction.user || null;
      this.channel = interaction.channel || null;
    } else if (message) {
      this.guild = message.guild || null;
      this.member = message.member || null;
      this.user = message.author || null;
      this.channel = message.channel || null;
    } else {
      this.guild = null;
      this.member = null;
      this.user = null;
      this.channel = null;
    }
  }

  get isSlash() {
    return this.source === 'slash';
  }

  get guildId() {
    return this.guild ? this.guild.id : null;
  }

  /** Dich theo ngon ngu cua server. */
  t(key, params) {
    return i18n.translate(this.language, key, params);
  }

  /**
   * Tra loi (hoac follow-up) cho lenh. Reply prefix khong the an
   * (ephemeral) — hien trong kenh thay vi that.
   * @param {object} payload du lieu gui { content?, embeds?, components?, files?, allowedMentions? }
   * @param {{ ephemeral?: boolean }} [opts] tuy chon an tin
   */
  async reply(payload, opts = {}) {
    const base = {
      content: payload.content,
      embeds: payload.embeds,
      components: payload.components,
      files: payload.files,
      allowedMentions: payload.allowedMentions || { parse: ['users'] },
    };

    if (this.isSlash) {
      const options = { ...base };
      if (opts.ephemeral) options.flags = MessageFlags.Ephemeral;
      if (!this.interaction.replied && !this.interaction.deferred) {
        this.replied = true;
        return this.interaction.reply(options);
      }
      this.replied = true;
      return this.interaction.followUp(options);
    }

    const result = await this.message.reply({ ...base, allowedMentions: { ...(base.allowedMentions || {}), repliedUser: false } });
    this.sentMessage = result;
    return result;
  }

  /** Bao dang xu ly (deferReply cho slash, chi danh cho prefix). */
  async deferReply(ephemeral = true) {
    if (this.isSlash) {
      if (!this.interaction.deferred && !this.interaction.replied) {
        await this.interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
      }
      this.deferred = true;
      return;
    }
    try {
      await this.channel.sendTyping();
    } catch {
      /* ignore */
    }
  }

  // ── Truy cap option (thong nhat giua slash + prefix) ─────────────────────

  getString(name, fallback = null) {
    const value = this.options[name];
    return value === undefined || value === null ? fallback : String(value);
  }

  getInt(name, fallback = null) {
    const value = this.options[name];
    if (value === undefined || value === null || value === '') return fallback;
    const n = Number(value);
    return Number.isNaN(n) ? fallback : Math.trunc(n);
  }

  getBool(name, fallback = false) {
    const value = this.options[name];
    return value === undefined || value === null ? fallback : Boolean(value);
  }

  /** Tra ve User muc tieu (hoac gia du phong). */
  getUser(name, fallback = null) {
    const value = this.options[name];
    if (!value) return fallback;
    return typeof value === 'object' && value.user ? value.user : value;
  }

  /** Tra ve GuildMember da resolve hoac null. */
  getMember(name, fallback = null) {
    const member = this.members[name];
    return member || fallback;
  }

  getRole(name, fallback = null) {
    return this.options[name] !== undefined ? this.options[name] : fallback;
  }

  getChannel(name, fallback = null) {
    return this.options[name] !== undefined ? this.options[name] : fallback;
  }

  /** Option thoi luong → millisecond (null khi sai/thieu). */
  getDuration(name) {
    const value = this.options[name];
    if (value === undefined || value === null || value === '') return null;
    return parseDuration(value);
  }

  // ── Ham tra loi tien ich ──────────────────────────────────────────────────

  sendSuccess(key, params = {}, extra = {}, opts = {}) {
    return this.reply({ embeds: [embeds.successEmbed(this.t(key, params))], ...extra }, opts);
  }

  sendError(key, params = {}, extra = {}, opts = {}) {
    return this.reply({ embeds: [embeds.errorEmbed(this.t(key, params))], ...extra }, opts);
  }

  sendInfo(key, params = {}, extra = {}, opts = {}) {
    return this.reply({ embeds: [embeds.infoEmbed(this.t(key, params))], ...extra }, opts);
  }
}

module.exports = Context;

module.exports = Context;
