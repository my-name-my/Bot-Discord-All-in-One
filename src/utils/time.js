/**
 * Duration parsing / formatting used by timeouts, cooldowns, giveaways,
 * durations. Accepted input examples: 10s, 5m, 2h, 3d, 1w,
 * "1h30m", a plain number of seconds ("90").
 */
const UNITS_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

const UNIT_KEYS = { w: 'weeks', d: 'days', h: 'hours', m: 'minutes', s: 'seconds' };

/**
 * @param {string|number|null} input
 * @returns {number|null} milliseconds, or null when invalid
 */
function parseDuration(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) && input > 0 ? input : null;
  }
  const str = String(input).trim().toLowerCase();
  if (!str) return null;
  if (/^\d+$/.test(str)) {
    const seconds = parseInt(str, 10);
    return seconds > 0 ? seconds * 1000 : null;
  }
  let total = 0;
  let matched = false;
  const re = /(\d+)\s*(w|d|h|m|s)/g;
  let match;
  while ((match = re.exec(str)) !== null) {
    total += parseInt(match[1], 10) * UNITS_MS[match[2]];
    matched = true;
  }
  if (!matched || total <= 0) return null;
  return total;
}

/**
 * @param {number} ms duration in milliseconds
 * @param {(key: string, params?: object) => string} [t] translate function
 * @returns {string} e.g. "2 ngày 3 giờ" / "2d 3h"
 */
function formatDuration(ms, t = null) {
  ms = Math.max(0, Math.floor(ms));
  if (ms < 1000) {
    return t ? t('time.lessThanSecond') : '<1s';
  }
  const parts = [];
  let rest = ms;
  const order = [['w', UNITS_MS.w], ['d', UNITS_MS.d], ['h', UNITS_MS.h], ['m', UNITS_MS.m], ['s', UNITS_MS.s]];
  for (const [suffix, size] of order) {
    const value = Math.floor(rest / size);
    if (value > 0) {
      parts.push(t ? t(`time.${UNIT_KEYS[suffix]}`, { count: value }) : `${value}${suffix}`);
      rest -= value * size;
    }
    if (parts.length >= 2) break;
  }
  return parts.join(' ') || (t ? t('time.lessThanSecond') : '<1s');
}

function futureDate(ms) {
  return new Date(Date.now() + ms);
}

module.exports = { parseDuration, formatDuration, futureDate, UNITS_MS };
