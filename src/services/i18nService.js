/**
 * i18n service. Locales live in /locales/<code>.json (vi default, en).
 * Commands must never hard-code user-facing strings — they call
 * ctx.t(key, params) which resolves through the guild's language.
 */
const config = require('../config/config');
const logger = require('../utils/logger');

const cache = new Map(); // code → parsed JSON tree

function loadLocales() {
  const fs = require('fs');
  const path = require('path');
  try {
    for (const file of fs.readdirSync(config.localeDir)) {
      if (!file.endsWith('.json')) continue;
      const code = path.basename(file, '.json');
      try {
        cache.set(code, JSON.parse(fs.readFileSync(path.join(config.localeDir, file), 'utf8')));
      } catch (error) {
        logger.error('i18n', `Invalid locale file ${file}: ${error.message}`);
      }
    }
    logger.info('i18n', `Loaded locales: ${[...cache.keys()].join(', ') || 'NONE'}`);
  } catch (error) {
    logger.error('i18n', `Cannot read locale directory: ${error.message}`);
  }
}

function locales() {
  return [...cache.keys()];
}

function lookup(code, key) {
  let obj = cache.get(code);
  for (const part of key.split('.')) {
    if (!obj || typeof obj !== 'object') return undefined;
    obj = obj[part];
  }
  return typeof obj === 'string' ? obj : undefined;
}

function interpolate(template, params) {
  if (!params) return template;
  let out = template;
  for (const [key, value] of Object.entries(params)) {
    out = out.split(`{${key}}`).join(String(value));
  }
  return out;
}

/**
 * Translate a key for a language code with fallback chain:
 * requested → default (vi) → en → raw key (so missing strings are visible).
 * @param {string|null} code
 * @param {string} key
 * @param {object} [params]
 */
function translate(code, key, params) {
  const chain = [code, config.defaultLanguage, 'en'].filter(Boolean);
  for (const lang of chain) {
    const template = lookup(lang, key);
    if (template !== undefined) return interpolate(template, params);
  }
  return key;
}

module.exports = { loadLocales, translate, locales };
