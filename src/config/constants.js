/**
 * Hằng số dùng chung: màu sắc, cấp quyền, giới hạn cứng, công thức XP.
 */
const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  error: 0xed4245,
  warning: 0xfee75c,
  neutral: 0x2b2d31,
  giveaway: 0xf47fff,
  ticket: 0x00b0f4,
};

// Số càng lớn quyền càng cao. Mỗi lệnh khai báo cấp tối thiểu cần có.
const PERMISSION_TIERS = { member: 0, staff: 1, mod: 2, admin: 3, owner: 4 };
const TIER_NAMES = Object.keys(PERMISSION_TIERS);

const LIMITS = {
  timeoutMaxMs: 28 * 24 * 60 * 60 * 1000, // Giới hạn cứng của Discord: 28 ngày
  timeoutStepsMs: [
    60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000,
    60 * 60 * 1000, 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000,
    7 * 24 * 60 * 60 * 1000, 14 * 24 * 60 * 60 * 1000, 28 * 24 * 60 * 60 * 1000,
  ],
  purgeMax: 100,
  giveawayMaxWinners: 20,
  giveawayMaxDurationMs: 30 * 24 * 60 * 60 * 1000,
  giveawayMinDurationMs: 10 * 1000,
  pollMaxOptions: 10,
  pollMaxDurationMs: 14 * 24 * 60 * 60 * 1000,
  pollMinDurationMs: 60 * 1000,
  betMin: 10,
  betMax: 100000,
  remindMaxMs: 365 * 24 * 60 * 60 * 1000,
  slowmodeMax: 21600, // Giới hạn cứng của Discord
  maxAutomodWords: 500,
  maxBadWordsLength: 100,
  transcriptMaxMessages: 500,
  ticketMaxPerUser: 1,
};

// Công thức level / XP: level = floor(sqrt(xp / XP.base))
const XP = {
  min: 15,
  max: 25,
  defaultCooldownSeconds: 60,
  base: 100,
};

module.exports = { COLORS, PERMISSION_TIERS, TIER_NAMES, LIMITS, XP };
