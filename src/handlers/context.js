/**
 * Unified execution context shared by slash and prefix paths.
 * Command business logic is written ONCE against this class.
 */
const { MessageFlags } = require('discord.js');
const i18n = require('../services/i18nService');
const embeds = require('../utils/embeds');
const config = require('../config/config');
const { parseDuration } = require('../utils/time');

class Context {
  /**
   * @param {object} params
   * @param {Client} params.client
   * @param {object} params.command the command definition
   * @param {'slash'|'prefix'} params.source
   * @param {CommandInteraction|null} params.interaction
   * @param {Message|null} params.message
   * @param {object} params.options resolved option values by name
   * @param {object} [params.members] resolved GuildMembers by option name
   * @param {object|null} [params.subcommand] active subcommand definition
   * @param {string|null} [params.language]
   * @param {object|null} [params.guildConfig]
   * @param {string} [params.prefix]
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

  /** Translate via the guild's language. */
  t(key, params) {
    return i18n.translate(this.language, key, params);
  }

  /**
   * Reply (or follow-up) to the invocation. Prefix replies cannot be
   * ephemeral — they are visible in the channel instead.
   * @param {object} payload { content?, embeds?, components?, files?, allowedMentions? }
   * @param {{ ephemeral?: boolean }} [opts]
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

  /** Signal ongoing work (deferReply for slash, typing indicator for prefix). */
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

  // ── Option accessors (unified across slash + prefix) ─────────────────────

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

  /** Returns the target User (or fallback). */
  getUser(name, fallback = null) {
    const value = this.options[name];
    if (!value) return fallback;
    return typeof value === 'object' && value.user ? value.user : value;
  }

  /** Returns the resolved GuildMember or null. */
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

  /** Duration option → milliseconds (null when invalid/missing). */
  getDuration(name) {
    const value = this.options[name];
    if (value === undefined || value === null || value === '') return null;
    return parseDuration(value);
  }

  // ── Convenience responders ────────────────────────────────────────────────

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
