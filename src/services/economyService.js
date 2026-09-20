/**
 * EconomyService — wallets/bank/inventory per guild+user (`economy`).
 * Mọi mutation read-modify-write đều chạy trong mutex theo tài khoản
 * (before: 2 lệnh chuyển tiền đồng thời có thể double-spend vì cả hai
 * cùng đọc wallet cũ rồi ghi đè). Amount không hợp lệ (<=0 / NaN) → null.
 */
const { getDatabase } = require('../database');
const guildConfigService = require('./guildConfigService');

const COLLECTION = 'economy';
const accountLocks = new Map(); // `${guildId}:${userId}` → tail promise

function collection() {
  return getDatabase().collection(COLLECTION);
}

function key(guildId, userId) {
  return `${guildId}:${userId}`;
}

/**
 * Chạy fn dưới khoá của 1..n tài khoản (acquire theo thứ tự key đã sort để
 * tránh deadlock khi transfer 2 chiều đồng thời).
 */
async function withAccountLock(accountKeys, fn) {
  const list = [...new Set(accountKeys)].sort();
  const held = []; // { k, gate }
  for (const k of list) {
    const prev = accountLocks.get(k) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    accountLocks.set(k, prev.then(() => gate));
    await prev;
    held.push({ k, gate, release });
  }
  try {
    return await fn();
  } finally {
    for (const { k, gate, release } of held) {
      release();
      // Chỉ xoá entry khi tail vẫn là gate của chính mình (không ai xếp hàng
      // sau) — nếu có, tail đã bị thay bằng promise mới của người kế tiếp.
      if (accountLocks.get(k) === gate) accountLocks.delete(k);
    }
  }
}

/** Validate amount: số nguyên dương hữu hạn, else null. */
function validAmount(amount) {
  const n = Math.trunc(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
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
  const n = validAmount(amount);
  if (n === null) return null;
  return withAccountLock([key(guildId, userId)], async () => {
    const { account, config, wallet } = await getBalances(guildId, userId);
    // Dùng wallet đã resolve (trường hợp mới = startingBalance) thay vì
    // account.wallet có thể null — nếu dùng raw thì lần thứ nhất account
    // chưa từng lưu sẽ bị bỏ qua startingBalance.
    const updated = { ...account, wallet: wallet + n };
    await saveAccount(guildId, userId, updated);
    return { ...updated, config };
  });
}

async function removeWallet(guildId, userId, amount) {
  const n = validAmount(amount);
  if (n === null) return null;
  return withAccountLock([key(guildId, userId)], async () => {
    const { wallet, bank, account, config } = await getBalances(guildId, userId);
    if (wallet < n) return null;
    const updated = { ...account, wallet: wallet - n, bank };
    await saveAccount(guildId, userId, updated);
    return { ...updated, config };
  });
}

async function setWallet(guildId, userId, amount) {
  const n = Math.trunc(amount);
  if (!Number.isFinite(n) || n < 0) return null;
  return withAccountLock([key(guildId, userId)], async () => {
    const { account, config } = await getBalances(guildId, userId);
    const updated = { ...account, wallet: n };
    await saveAccount(guildId, userId, updated);
    return { ...updated, config };
  });
}

async function transfer(fromGuildId, fromUserId, toUserId, amount) {
  const n = validAmount(amount);
  if (n === null) return null;
  if (fromUserId === toUserId) return null; // self-transfer chặn ở service
  return withAccountLock([key(fromGuildId, fromUserId), key(fromGuildId, toUserId)], async () => {
    const from = await getBalances(fromGuildId, fromUserId);
    if (from.wallet < n) return null;
    const to = await getBalances(fromGuildId, toUserId);
    // Cả 2 ghi trong CÙNG 1 khoá — trước đây 2 bước rời rạc: nếu bước cộng
    // người nhận lỗi thì tiền của người gửi biến mất.
    await saveAccount(fromGuildId, fromUserId, { ...from.account, wallet: from.wallet - n });
    await saveAccount(fromGuildId, toUserId, { ...to.account, wallet: to.wallet + n });
    return { ...{ ...from.account, wallet: from.wallet - n }, config: from.config };
  });
}

async function deposit(guildId, userId, amount) {
  const n = validAmount(amount);
  if (n === null) return null;
  return withAccountLock([key(guildId, userId)], async () => {
    const { wallet, bank, account, config } = await getBalances(guildId, userId);
    if (wallet < n) return null;
    const updated = { ...account, wallet: wallet - n, bank: bank + n };
    await saveAccount(guildId, userId, updated);
    return { ...updated, config };
  });
}

async function withdraw(guildId, userId, amount) {
  const n = validAmount(amount);
  if (n === null) return null;
  return withAccountLock([key(guildId, userId)], async () => {
    const { wallet, bank, account, config } = await getBalances(guildId, userId);
    if (bank < n) return null;
    const updated = { ...account, wallet: wallet + n, bank: bank - n };
    await saveAccount(guildId, userId, updated);
    return { ...updated, config };
  });
}

/**
 * Mua 1 item từ shop (nguyên tử: kiểm tra số dư → trừ tiền → cộng inventory).
 * @param {object} item { id, name, price, roleId? } từ config.economy.shop
 * @returns {{ ok: true, account } | { ok: false, reason: 'invalid'|'insufficient' }}
 */
async function purchase(guildId, userId, item) {
  if (!item || !validAmount(item.price)) return { ok: false, reason: 'invalid' };
  return withAccountLock([key(guildId, userId)], async () => {
    const { wallet, account, config } = await getBalances(guildId, userId);
    if (wallet < item.price) return { ok: false, reason: 'insufficient' };
    const updated = { ...account, wallet: wallet - item.price };
    updated.inventory = Array.isArray(updated.inventory) ? updated.inventory : [];
    const existing = updated.inventory.find((i) => i.id === item.id);
    if (existing) existing.quantity += 1;
    else updated.inventory.push({ id: item.id, name: item.name, quantity: 1 });
    await saveAccount(guildId, userId, updated);
    return { ok: true, account: { ...updated, config } };
  });
}

/**
 * Đặt cược nguyên tử cho minigame: trừ `bet` rồi cộng `payout` trong CÙNG một
 * khoá tài khoản.
 *
 * Trước đây games tự gọi `getBalances` (kiểm tra) rồi `addWallet`/`removeWallet`
 * (ghi) ở 3 bước rời rạc → 2 ván chạy song song đều thấy đủ tiền và cùng trừ,
 * và giá trị trả về của `removeWallet` bị bỏ qua nên người chơi vẫn được báo là
 * "thua -bet" dù tiền không hề bị trừ (lách luật).
 *
 * @param {string} guildId
 * @param {string} userId
 * @param {number} bet tiền cược (phải > 0)
 * @param {number} [payout] tiền thắng nhận lại (0 = thua sạch)
 * @returns {Promise<{ ok: true, wallet: number, net: number }
 *   | { ok: false, reason: 'invalid'|'insufficient', balance?: number }>}
 */
async function settleBet(guildId, userId, bet, payout = 0) {
  const stake = validAmount(bet);
  if (stake === null) return { ok: false, reason: 'invalid' };
  const prize = Math.max(0, Math.trunc(Number(payout)) || 0);
  return withAccountLock([key(guildId, userId)], async () => {
    const { wallet, account, config } = await getBalances(guildId, userId);
    if (wallet < stake) return { ok: false, reason: 'insufficient', balance: wallet };
    const updated = { ...account, wallet: wallet - stake + prize };
    const saved = await saveAccount(guildId, userId, updated);
    return { ok: true, wallet: saved.wallet, net: prize - stake, config };
  });
}

async function markDaily(guildId, userId) {
  return withAccountLock([key(guildId, userId)], async () => {
    const account = await getAccount(guildId, userId);
    account.lastDaily = Date.now();
    await saveAccount(guildId, userId, account);
  });
}

async function markWork(guildId, userId) {
  return withAccountLock([key(guildId, userId)], async () => {
    const account = await getAccount(guildId, userId);
    account.lastWork = Date.now();
    await saveAccount(guildId, userId, account);
  });
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
  const n = validAmount(quantity);
  if (n === null) return null;
  return withAccountLock([key(guildId, userId)], async () => {
    const account = await getAccount(guildId, userId);
    account.inventory = Array.isArray(account.inventory) ? account.inventory : [];
    const existing = account.inventory.find((i) => i.id === itemId);
    if (existing) existing.quantity += n;
    else account.inventory.push({ id: itemId, quantity: n });
    await saveAccount(guildId, userId, account);
    return account.inventory;
  });
}

async function removeItem(guildId, userId, itemId, quantity = 1) {
  const n = validAmount(quantity);
  if (n === null) return null;
  return withAccountLock([key(guildId, userId)], async () => {
    const account = await getAccount(guildId, userId);
    account.inventory = Array.isArray(account.inventory) ? account.inventory : [];
    const index = account.inventory.findIndex((i) => i.id === itemId);
    if (index === -1) return null;
    account.inventory[index].quantity -= n;
    if (account.inventory[index].quantity <= 0) account.inventory.splice(index, 1);
    await saveAccount(guildId, userId, account);
    return account.inventory;
  });
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
  purchase,
  settleBet,
  markDaily,
  markWork,
  leaderboard,
  addItem,
  removeItem,
  withAccountLock,
};
