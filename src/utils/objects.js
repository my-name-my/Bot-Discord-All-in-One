/**
 * Small object helpers: deep merge (used for per-guild config defaults)
 * and structured clones that work on older Node versions.
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

/**
 * Deep merge `source` into `target` (mutates target).
 * Missing keys in source keep the target's (default) value.
 */
function deepMerge(target, source) {
  if (!isPlainObject(source)) return target;
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (isPlainObject(value) && isPlainObject(target[key])) {
      deepMerge(target[key], value);
    } else {
      target[key] = clone(value);
    }
  }
  return target;
}

module.exports = { isPlainObject, clone, deepMerge };
