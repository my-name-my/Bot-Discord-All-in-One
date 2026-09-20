/**
 * In-memory cooldown buckets.
 *
 * Scopes:
 *   user    → key per user id           (e.g. /slots 5s per user)
 *   guild   → key per guild id          (e.g. one raid-scan per server)
 *   command → single global bucket      (e.g. heavy API call)
 *
 * The bucket is claimed BEFORE the command runs, so parallel invocations
 * of the same command by the same user cannot slip through.
 */
const buckets = new Map(); // key → expiry timestamp
let lastPrune = 0;

function prune(force = false) {
  const now = Date.now();
  if (!force && now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [key, expiry] of buckets) {
    if (expiry <= now) buckets.delete(key);
  }
}

/**
 * @param {'user'|'guild'|'command'} scope
 * @param {string} entityId user id / guild id / 'global'
 * @param {string} commandName
 * @param {number} seconds cooldown length
 * @returns {{ ok: boolean, remaining?: number }} remaining ms when blocked
 */
function check(scope, entityId, commandName, seconds) {
  if (!seconds || seconds <= 0) return { ok: true };
  const key = `${scope}:${entityId}:${commandName}`;
  const now = Date.now();
  const expiry = buckets.get(key);
  if (expiry && expiry > now) {
    return { ok: false, remaining: expiry - now };
  }
  buckets.set(key, now + seconds * 1000);
  if (buckets.size > 20_000) prune(true);
  else prune();
  return { ok: true };
}

function reset(scope, entityId, commandName) {
  buckets.delete(`${scope}:${entityId}:${commandName}`);
}

function clear() {
  buckets.clear();
}

module.exports = { check, reset, clear };
