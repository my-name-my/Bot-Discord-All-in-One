/**
 * Bộ nạp lệnh — quét các module lệnh trong src/commands/**.
 *
 * Một module lệnh xuất:
 * {
 *   name: 'ban',                       // bắt buộc, duy nhất
 *   description: '...',                 // hiển thị trong UI slash
 *   category: 'moderation',            // tên thư mục
 *   aliases: ['b'],                    // chỉ dùng cho prefix
 *   usage: 'ban <user> [reason]',      // hướng dẫn dùng
 *   vi du: ['ban @user spam'],
 *   permissions: { tier: 'mod', bot: ['BanMembers'] }, // quyen yeu cau
 *   cooldown: { seconds: 3, scope: 'user' }, // thoi gian cho
 *   module: 'moderation',              // key trong guildConfig.modules để bật/tắt
 *   guildOnly: true, // chi dung trong server
 *   slash: true,                       // đăng ký làm slash command
 *   options: [ { name, type, description, required } ],   // tùy chọn slash
 *   subcommands: [ { name, description, options } ],      // tùy chọn
 *   run: async (ctx) => {}             // logic nghiệp vụ dùng chung
 * }
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class CommandLoader {
  constructor() {
    /** @type {Map<string, object>} tên/alias → lệnh */
    this.commands = new Map();
    /** @type {Map<string, object>} tên chuẩn → lệnh */
    this.byName = new Map();
    /** @type {Map<string, string[]>} category → danh sách tên */
    this.categories = new Map();
  }

  /**
   * @param {string} commandsDir đường dẫn tuyệt đối tới src/commands
   * @returns {Promise<{ loaded: number, errors: string[] }>} so lenh nap duoc va loi
   */
  async load(commandsDir) {
    this.commands.clear();
    this.byName.clear();
    this.categories.clear();
    const errors = [];

    if (!fs.existsSync(commandsDir)) {
      logger.warn('commands', `Directory not found: ${commandsDir}`);
      return { loaded: 0, errors };
    }

    const categories = fs.readdirSync(commandsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    let loaded = 0;
    for (const category of categories) {
      const dir = path.join(commandsDir, category);
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          delete require.cache[require.resolve(filePath)];
          const definition = require(filePath);
          if (!definition || !definition.name || typeof definition.run !== 'function') {
            errors.push(`${filePath}: thiếu name hoặc run()`);
            continue;
          }
          definition.category = definition.category || category;
          this.register(definition);
          loaded++;
        } catch (error) {
          errors.push(`${filePath}: ${error.message}`);
        }
      }
    }

    logger.info('commands', `Đã nạp ${loaded} lệnh trong ${this.categories.size} nhóm`);
    if (errors.length) {
      for (const error of errors) logger.error('commands', error);
    }
    return { loaded, errors };
  }

  register(definition) {
    this.byName.set(definition.name, definition);
    this.commands.set(definition.name, definition);
    for (const alias of definition.aliases || []) {
      if (this.commands.has(alias)) {
        logger.warn('commands', `Xung đột alias: "${alias}" đã được ánh xạ — bỏ qua`);
        continue;
      }
      this.commands.set(alias, definition);
    }
    if (!this.categories.has(definition.category)) this.categories.set(definition.category, []);
    this.categories.get(definition.category).push(definition.name);
  }

  get(name) {
    return this.commands.get(String(name).toLowerCase()) || null;
  }

  /** Toàn bộ lệnh gốc (không trùng alias). */
  all() {
    return [...this.byName.values()];
  }

  /** Dựng map "Tên lệnh → lệnh" cho bộ phân trang help. */
  listByCategory() {
    const result = [];
    for (const [category, names] of this.categories) {
      result.push({ category, commands: names.map((n) => this.byName.get(n)).filter(Boolean) });
    }
    return result;
  }
}

module.exports = { CommandLoader };
