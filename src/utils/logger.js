/**
 * Tiny leveled console logger. Sensitive values must never be logged
 * (tokens, database URLs) — log only what is safe.
 */
const config = require('../config/config');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function shouldPrint(level) {
  const configured = LEVELS[config.logLevel] || LEVELS.info;
  return LEVELS[level] >= configured;
}

function log(level, tag, message) {
  if (!shouldPrint(level)) return;
  const stamp = new Date().toISOString();
  const line = `[${stamp}] [${level.toUpperCase().padEnd(5)}]${tag ? ` [${tag}]` : ''} ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

module.exports = {
  debug: (tag, message) => log('debug', tag, message),
  info: (tag, message) => log('info', tag, message),
  warn: (tag, message) => log('warn', tag, message),
  error: (tag, message) => log('error', tag, message),
};
