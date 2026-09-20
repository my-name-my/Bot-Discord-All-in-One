/**
 * Cấu hình chung, nạp một lần từ biến môi trường (.env).
 * Không hard-code secret ở đây — mọi thông tin nhạy cảm đều lấy từ .env.
 */
require('dotenv').config();
const path = require('path');

const parseList = (value) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const config = {
  // Thông tin đăng nhập Discord
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  ownerIds: parseList(process.env.OWNER_IDS),

  // Giá trị mặc định (có thể ghi đè từng server qua /config)
  defaultPrefix: process.env.PREFIX || '!',
  defaultLanguage: process.env.DEFAULT_LANGUAGE || 'vi',

  // Database — để trống nghĩa là dùng file JSON trong data/db
  databaseUrl: process.env.DATABASE_URL || '',
  dataDir: path.join(process.cwd(), 'data'),

  // Đăng ký slash command
  autoRegisterCommands: process.env.AUTO_REGISTER_COMMANDS !== 'false',
  devGuildId: process.env.DEV_GUILD_ID || '',

  // Dashboard trạng thái (tùy chọn)
  dashboard: {
    enabled: process.env.DASHBOARD_ENABLED === 'true',
    port: parseInt(process.env.DASHBOARD_PORT, 10) || 3000,
  },

  // Ghi log
  logLevel: process.env.LOG_LEVEL || 'info',

  // Dịch vụ ngoài (tùy chọn)
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID || '',
    clientSecret: process.env.TWITCH_CLIENT_SECRET || '',
  },

  // Đường dẫn tĩnh
  localeDir: path.join(process.cwd(), 'locales'),
};

module.exports = config;
