/**
 * WarningService — warn history per guild+user, stored in `warnings`.
 * Document: { cases: [{ number, userId, moderatorId, reason, at }] }
 */
const { getDatabase } = require('../database');

const COLLECTION = 'warnings';

function collection() {
  return getDatabase().collection(COLLECTION);
}

function key(guildId, userId) {
  return `${guildId}:${userId}`;
}

async function getCases(guildId, userId) {
  const doc = await collection().get(key(guildId, userId));
  return doc && Array.isArray(doc.cases) ? doc.cases : [];
}

/**
 * @returns {Promise<{ cases: Array, total: number }>}
 */
async function addCase(guildId, userId, moderatorId, reason) {
  const cases = await getCases(guildId, userId);
  const maxNumber = cases.reduce((max, c) => Math.max(max, c.number), 0);
  const entry = {
    number: maxNumber + 1,
    userId,
    moderatorId,
    reason: String(reason || '').slice(0, 1000) || 'No reason',
    at: Date.now(),
  };
  cases.push(entry);
  await collection().set(key(guildId, userId), { cases });
  return { cases, total: cases.length, entry };
}

/**
 * Remove a specific warning by case number.
 * @returns {Promise<boolean>} removed?
 */
async function removeCase(guildId, userId, caseNumber) {
  const cases = await getCases(guildId, userId);
  const index = cases.findIndex((c) => c.number === caseNumber);
  if (index === -1) return false;
  cases.splice(index, 1);
  await collection().set(key(guildId, userId), { cases });
  return true;
}

async function clearCases(guildId, userId) {
  const before = await getCases(guildId, userId);
  await collection().set(key(guildId, userId), { cases: [] });
  return before.length;
}

module.exports = { getCases, addCase, removeCase, clearCases };
