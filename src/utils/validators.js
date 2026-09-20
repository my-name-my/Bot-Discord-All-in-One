/**
 * Input validation helpers. Every user-provided value must pass through
 * these before reaching business logic or the database layer.
 */
function clampInt(value, min, max, fallback = min) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function isSnowflake(value) {
  return /^\d{17,20}$/.test(String(value || ''));
}

/** Truncate and normalize free-form user input. */
function sanitize(text, max = 1000) {
  return String(text ?? '').slice(0, max).trim();
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Strip control characters that break embed rendering. */
function stripControl(text) {
  // eslint-disable-next-line no-control-regex
  return String(text ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

module.exports = { clampInt, isSnowflake, sanitize, escapeHtml, isHttpUrl, stripControl };
