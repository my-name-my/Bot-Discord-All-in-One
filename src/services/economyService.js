/**
 * EconomyService — wallets/bank/inventory per guild+user (`economy`).
 * Balance mutations are read-modify-write per document; positive amounts
 * are validated by callers via validators + commands.
 */
const { getDatabase } = require('../database');
const guildConfigService = require('./guildConfigService');

const COLLECTION = 'economy';

function collection() {
  return getDatabase().collection(COLLECTION);
}

function key(guildId, userId) {
  return `${guildId}:${userId}`;
}

/**
 * @returns {Promise<{ wallet: number, bank: number, inventory: Array, lastDaily: number, lastWork: number }>}
 */
async function getAccount(guildId, userId) {
  const doc = await collection().get(key(guildId, userId));
  return doc || { wallet: null, bank: 0, inventory: [], lastDaily: 0, lastWork: 0 };
}

async function saveAccount(guildId, userId, account) {
  const config = await guildConfigService.get(guildId);
  if (account.wallet === null || account.wallet === undefined) {
    account.wallet = config.economy.startingBalance;
  }
  account.wallet = Math.max(0, Math.trunc(account.wallet));
  account.bank = Math.max(0, Math.trunc(account.bank));
  await collection().set(key(guildId, userId), account);
  return account;
}

async function getBalances(guildId, userId) {
  const config = await guildConfigService.get(guildId);
  const account = await getAccount(guildId, userId);
  const wallet = account.wallet === null || account.wallet === undefined
    ? config.economy.startingBalance
    : account.wallet;
  return { wallet, bank: account.bank || 0, account, config };
}

async function addWallet(guildId, userId, amount) {
  const { account, config } = await getBalances(guildId, userId);
  account.wallet += amount;
  return saveAccount(guildId, userId, { ...account, wallet: Math.max(0, account.wallet) }) && { ...account, wallet: Math.max(0, account.wallet), config };
}

async function removeWallet(guildId, userId, amount) {
  const { wallet, bank, account, config } = await getBalances(guildId, userId);
  if (wallet < amount) return null;
  const updated = { ...account, wallet: wallet - amount, bank };
  await saveAccount(guildId, userId, updated);
  return { ...updated, config };
}

async function setWallet(guildId, userId, amount) {
  const { account, config } = await getBalances(guildId, userId);
  const updated = { ...account, wallet: Math.max(0, Math.trunc(amount)) };
  await saveAccount(guildId, userId, updated);
  return { ...updated, config };
}

async function transfer(fromGuildId, fromUserId, toUserId, amount) {
  const removed = await removeWallet(fromGuildId, fromUserId, amount);
  if (!removed) return null;
  const { account, config } = await getBalances(fromGuildId, toUserId);
  const updated = { ...account, wallet: (account.wallet ?? config.economy.startingBalance) + amount };
  await saveAccount(fromGuildId, toUserId, updated);
  return removed;
}

async function deposit(guildId, userId, amount) {
  const { wallet, bank, account, config } = await getBalances(guildId, userId);
  if (wallet < amount) return null;
  const updated = { ...account, wallet: wallet - amount, bank: bank + amount };
  await saveAccount(guildId, userId, updated);
  return updated;
}

async function withdraw(guildId, userId, amount) {
  const { wallet, bank, account, config } = await getBalances(guildId, userId);
  if (bank < amount) return null;
  const updated = { ...account, wallet: wallet + amount, bank: bank - amount };
  await saveAccount(guildId, userId, updated);
  return updated;
}

async function markDaily(guildId, userId) {
  const account = await getAccount(guildId, userId);
  account.lastDaily = Date.now();
  await saveAccount(guildId, userId, account);
}

async function markWork(guildId, userId) {
  const account = await getAccount(guildId, userId);
  account.lastWork = Date.now();
  await saveAccount(guildId, userId, account);
}

/** Economy leaderboard (richest by wallet+bank). */
async function leaderboard(guildId, limit = 10) {
  const rows = await collection().find((doc) => String(doc.id || '').startsWith(`${guildId}:`));
  return rows
    .map((row) => ({
      userId: row.id.split(':')[1],
      wallet: row.wallet ?? 0,
      bank: row.bank || 0,
      total: (row.wallet ?? 0) + (row.bank || 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

// ── Inventory ────────────────────────────────────────────────────────────────

async function addItem(guildId, userId, itemId, quantity = 1) {
  const account = await getAccount(guildId, userId);
  account.inventory = Array.isArray(account.inventory) ? account.inventory : [];
  const existing = account.inventory.find((i) => i.id === itemId);
  if (existing) existing.quantity += quantity;
  else account.inventory.push({ id: itemId, quantity });
  await saveAccount(guildId, userId, account);
  return account.inventory;
}

async function removeItem(guildId, userId, itemId, quantity = 1) {
  const account = await getAccount(guildId, userId);
  account.inventory = Array.isArray(account.inventory) ? account.inventory : [];
  const index = account.inventory.findIndex((i) => i.id === itemId);
  if (index === -1) return null;
  account.inventory[index].quantity -= quantity;
  if (account.inventory[index].quantity <= 0) account.inventory.splice(index, 1);
  await saveAccount(guildId, userId, account);
  return account.inventory;
}

module.exports = {
  getAccount,
  getBalances,
  addWallet,
  removeWallet,
  setWallet,
  transfer,
  deposit,
  withdraw,
  markDaily,
  markWork,
  leaderboard,
  addItem,
  removeItem,
};
