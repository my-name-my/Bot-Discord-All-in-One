/**
 * CommandHandler — thực thi lệnh qua MỘT pipeline cho cả slash
 * lẫn prefix (spec §22):
 *
 *   Command Input → Parser → Handler → Kiểm tra quyền
 *                 → Kiểm tra cooldown → Business Logic → Phản hồi
 *
 * Xử lý lỗi tập trung (spec §20): lệnh lỗi không bao giờ làm crash
 * bot; người dùng nhận thông báo thân thiện; chi tiết ghi ra console
 * + kênh log lỗi của server (không kèm secret hay stack trace).
 */
const Context = require('./context');
const permissionService = require('../services/permissionService');
const cooldownService = require('../services/cooldownService');
const guildConfigService = require('../services/guildConfigService');
const logger = require('../utils/logger');
const embeds = require('../utils/embeds');

class CommandHandler {
  constructor(client, loader, errorReporter = null) {
    this.client = client;
    this.loader = loader;
    this.errorReporter = errorReporter;
  }

  async reportError(context, error) {
    logger.error('cmd', `${context.command ? context.command.name : '?'} failed: ${error.stack || error}`);
    if (this.errorReporter) {
      try {
        await this.errorReporter.reportCommandError(context, error);
      } catch (reportError) {
        logger.error('cmd', `error reporter failed: ${reportError.message}`);
      }
    }
  }

  async sendErrorReply(context) {
    try {
      await context.reply({ embeds: [embeds.errorEmbed(context.t('common.error'))] }, { ephemeral: true });
    } catch (sendError) {
      logger.error('cmd', `could not deliver error message: ${sendError.message}`);
    }
  }

  async handleSlash(interaction) {
    if (!interaction.isChatInputCommand()) return;
    const command = this.loader.get(interaction.commandName);
    if (!command) {
      try {
        await interaction.reply({ content: '❓ Unknown command.', flags: 64 });
      } catch { /* ignore */ }
      return;
    }
    const { options, members, subcommand } = this.resolveSlashOptions(interaction, command);
    await this.run({
      command,
      source: 'slash',
      interaction,
      options,
      members,
      subcommand,
    });
  }

  async handlePrefix(message, parsed, prefix) {
    if (!parsed.command) return; // lệnh lạ → im lặng (không spam)
    await this.run({
      command: parsed.command,
      source: 'prefix',
      message,
      prefix,
      options: parsed.options,
      members: parsed.members,
      subcommand: parsed.subcommand,
    });
  }

  /** Ánh xạ tùy chọn slash interaction thành giá trị thuần theo tên. */
  resolveSlashOptions(interaction, command) {
    const options = {};
    const members = {};
    const group = interaction.options.getSubcommandGroup(false);
    const subName = interaction.options.getSubcommand(false);
    const subcommand = this.findSubcommand(command, [group, subName].filter(Boolean));

    for (const optDef of (subcommand ? subcommand.options : command.options) || []) {
      const value = interaction.options.get(optDef.name);
      if (!value) continue;
      switch (optDef.type) {
        case 'user':
          options[optDef.name] = value.user || null;
          if (value.member) members[optDef.name] = value.member;
          break;
        case 'member':
          if (value.member) {
            members[optDef.name] = value.member;
            options[optDef.name] = value.member.user || null;
          }
          break;
        case 'channel':
          options[optDef.name] = value.channel || null;
          break;
        case 'role':
          options[optDef.name] = value.role || null;
          break;
        default:
          options[optDef.name] = value.value;
      }
    }
    return { options, members, subcommand };
  }

  findSubcommand(command, path) {
    let node = command;
    for (const part of path) {
      if (!node || !Array.isArray(node.subcommands)) return null;
      node = node.subcommands.find((sub) => sub.name === part) || null;
    }
    return node && node !== command ? node : null;
  }

  /**
   * Pipeline chinh: quyen → cooldown → cong module → logic nghiep vu.
   * @param {object} params cac tham so
   */
  async run({ command, source, interaction = null, message = null, prefix = null, options = {}, members = {}, subcommand = null }) {
    const client = this.client;
    let context = null;
    try {
      const guildConfig = message?.guild || interaction?.guild
        ? await guildConfigService.get(message?.guild?.id || interaction?.guild?.id)
        : null;
      const language = guildConfig?.language || null;
      context = new Context({
        client,
        command,
        source,
        interaction,
        message,
        options,
        members,
        subcommand,
        language,
        guildConfig,
        prefix: prefix || guildConfig?.prefix || null,
      });

      // 1) Bắt buộc chạy trong server
      if ((command.guildOnly !== false) && !context.guild) {
        await context.sendError('common.guildOnly', {}, {}, { ephemeral: true });
        return;
      }

      // 2) Chặn theo module (công tắc tính năng từng server)
      if (command.module && context.guildConfig && context.guildConfig.modules
        && context.guildConfig.modules[command.module] === false) {
        await context.sendError('common.disabledModule', { module: command.module }, {}, { ephemeral: true });
        return;
      }

      // 3) Kiểm tra quyền (cấp của người dùng)
      const permission = permissionService.checkPermission({
        member: context.member,
        userId: context.user ? context.user.id : null,
        guildConfig: context.guildConfig,
        client,
        requiredTier: command.permissions ? command.permissions.tier : 'member',
        t: (key, params) => context.t(key, params),
      });
      if (!permission.ok) {
        await context.sendError('common.noPermissions', {}, {}, { ephemeral: true });
        return;
      }

      // 4) Kiểm tra quyền của bot
      const botPerms = permissionService.checkBotPermissions(
        context.guild,
        command.permissions ? command.permissions.bot : []
      );
      if (!botPerms.ok) {
        await context.sendError('common.botNoPermissions', {
          permission: botPerms.missing.map((m) => permissionService.readablePermissionName(m)).join(', '),
        }, {}, { ephemeral: true });
        return;
      }

      // 5) Kiểm tra cooldown (chiếm trước khi chạy; hoàn lại khi lỗi)
      const cooldown = command.cooldown || { seconds: 0, scope: 'user' };
      const cooldownKey = cooldown.scope === 'guild' ? (context.guildId || 'global')
        : cooldown.scope === 'command' ? 'global'
          : (context.user ? context.user.id : 'unknown');
      const cooldownCheck = cooldownService.check(cooldown.scope, cooldownKey, command.name, cooldown.seconds);
      if (!cooldownCheck.ok) {
        const { formatDuration } = require('../utils/time');
        await context.sendError('common.cooldown', { time: formatDuration(cooldownCheck.remaining, context.t.bind(context)) }, {}, { ephemeral: true });
        return;
      }

      // 6) Business logic — MỘT bản cài đặt cho cả slash + prefix
      await command.run(context);
    } catch (error) {
      if (context) {
        // hoàn cooldown để crash không khiến người dùng bị khóa vĩnh viễn
        if (command && command.cooldown && command.cooldown.seconds) {
          const key = command.cooldown.scope === 'guild' ? (context.guildId || 'global')
            : command.cooldown.scope === 'command' ? 'global'
              : (context.user ? context.user.id : 'unknown');
          cooldownService.reset(command.cooldown.scope, key, command.name);
        }
        await this.reportError(context, error);
        await this.sendErrorReply(context);
      } else {
        logger.error('cmd', `failed before context creation: ${error.stack || error}`);
      }
    }
  }
}

module.exports = CommandHandler;
