/** Điểm vào chính — khởi động bot theo thứ tự:
 *   1. Nạp ngôn ngữ + cấu hình
 *   2. Khởi tạo database (JSON dự phòng / SQLite / Postgres / MySQL)
 *   3. Nạp lệnh, sự kiện, route component
 *   4. Gắn service (automod, levels, welcome, tickets, giveaways…)
 *   5. Đăng nhập Discord
 * Bước nào lỗi sẽ log rõ ràng và thoát với mã lỗi (fail-fast khi boot).
 */
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config/config');
const logger = require('./utils/logger');
const i18n = require('./services/i18nService');
const { initDatabase } = require('./database');
const { CommandLoader } = require('./handlers/commandLoader');
const { EventLoader } = require('./handlers/eventLoader');
const CommandHandler = require('./handlers/commandHandler');
const componentHandler = require('./handlers/componentHandler');
const path = require('path');

// ── Lưới an toàn cấp process (spec §20: không bao giờ crash) ────────────────
process.on('unhandledRejection', (reason) => {
  logger.error('process', `Unhandled rejection: ${reason && reason.stack ? reason.stack : reason}`);
});
process.on('uncaughtException', (error) => {
  logger.error('process', `Uncaught exception: ${error.stack || error}`);
});

async function main() {
  logger.info('boot', 'Starting All-in-One Discord Bot…');

  // Ngôn ngữ
  i18n.loadLocales();

  // Client Discord
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
  });

  // Cơ sở dữ liệu
  const db = await initDatabase();

  // Services registry (giữ nhẹ phụ thuộc; mỗi service tự lazy-require db)
  const loggingService = require('./services/loggingService');
  const warningService = require('./services/warningService');
  const levelService = require('./services/levelService');
  const economyService = require('./services/economyService');
  const automodService = require('./services/automodService');
  const welcomeService = require('./services/welcomeService');
  const ticketService = require('./services/ticketService');
  const giveawayService = require('./services/giveawayService');
  const pollService = require('./services/pollService');
  const reminderService = require('./services/reminderService');
  const roleMenuService = require('./services/roleMenuService');
  const notificationService = require('./services/notificationService');

  // Route component (module tính năng tự đăng ký)
  require('./interactions/registerAll');

  // Lệnh
  const loader = new CommandLoader();
  await loader.load(path.join(__dirname, 'commands'));

  // Bộ báo lỗi → kênh log lỗi của server
  const errorReporter = { reportCommandError: (ctx, error) => loggingService.reportCommandError(ctx, error) };
  const commandHandler = new CommandHandler(client, loader, errorReporter);

  // Context dùng chung truyền cho các event
  const ctx = {
    db,
    commands: loader,
    commandHandler,
    services: {
      loggingService,
      warningService,
      levelService,
      economyService,
      automodService,
      welcomeService,
      ticketService,
      giveawayService,
      pollService,
      reminderService,
      roleMenuService,
      notificationService,
    },
    defaultPrefix: config.defaultPrefix,
  };

  // Sự kiện
  const eventLoader = new EventLoader();
  eventLoader.load(client, path.join(__dirname, 'events'), ctx);

  // Tự khôi phục timer của service cần client đang hoạt động
  giveawayService.setClient(client);
  pollService.setClient(client);
  reminderService.setClient(client);
  notificationService.setClient(client);
  ticketService.setClient(client);
  loggingService.setClient(client);

  // Đăng nhập
  if (!config.token) {
    logger.error('boot', 'DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  await client.login(config.token);
  logger.info('boot', 'Bot is online.');
}

main().catch((error) => {
  logger.error('boot', `Fatal startup error: ${error.stack || error}`);
  process.exit(1);
});
