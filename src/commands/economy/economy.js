const economyService = require('../../services/economyService');
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');
const logger = require('../../utils/logger');

module.exports = {
  name: 'economy',
  description: 'Economy commands: balance, daily, work, deposit, withdraw, pay, shop, inventory, admin',
  category: 'economy',
  aliases: ['eco', 'bal'],
  usage: 'economy <balance|daily|work|deposit|withdraw|pay|shop|inventory|admin> [target] [amount]',
  cooldown: { seconds: 0, scope: 'user' },
  permissions: { tier: 'member' },
  guildOnly: true,
  slash: true,
  subcommands: [
    { name: 'balance', description: 'View balance', options: [{ name: 'user', type: 'member', description: 'User to view', required: false }] },
    { name: 'daily', description: 'Claim daily' },
    { name: 'work', description: 'Work for coins' },
    { name: 'deposit', description: 'Deposit coins', options: [{ name: 'amount', type: 'int', description: 'Amount', required: true, minValue: 1 }] },
    { name: 'withdraw', description: 'Withdraw coins', options: [{ name: 'amount', type: 'int', description: 'Amount', required: true, minValue: 1 }] },
    { name: 'pay', description: 'Send coins', options: [{ name: 'user', type: 'member', description: 'Recipient', required: true }, { name: 'amount', type: 'int', description: 'Amount', required: true, minValue: 1 }] },
    { name: 'shop', description: 'Open shop' },
    { name: 'buy', description: 'Buy an item from the shop', options: [{ name: 'item', type: 'string', description: 'Item id or name', required: true }] },
    { name: 'inventory', description: 'View inventory', options: [{ name: 'user', type: 'member', description: 'User to view', required: false }] },
    { name: 'admin', description: 'Admin add/remove/set', options: [
      { name: 'action', type: 'string', description: 'add | remove | set', required: true, choices: [{ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'set', value: 'set' }] },
      { name: 'user', type: 'member', description: 'Target member', required: true },
      { name: 'amount', type: 'int', description: 'Amount', required: true },
    ]},
  ],
  async run(ctx) {
    if (ctx.subcommand && ctx.subcommand.name) {
      return economyCommand(ctx);
    }
    const args = ctx.message?.content ? ctx.message.content.slice(ctx.prefix?.length || 0).trim().split(/ +/) : [];
    if (!args.length) return ctx.sendError('economy.usage', {}, {}, { ephemeral: false });
    const sub = args[0].toLowerCase();
    if (![/^(balance|bal|eco)$/, /^daily$/, /^work$/, /^deposit$/, /^withdraw$/, /^pay$/, /^shop$/, /^buy$/, /^inventory$/, /^admin$/].some((r) => r.test(sub))) {
      return ctx.sendError('economy.usage', {}, {}, { ephemeral: false });
    }
    const options = resolvePrefixOptions(ctx, sub, args.slice(1));
    if (options.error) return ctx.sendError(options.error, {}, {}, { ephemeral: false });
    Object.assign(ctx.options, options.options);
    ctx.subcommand = { name: sub };
    return economyCommand(ctx);
  },
};

/** Dispatch to the subcommand handler (shared by slash + prefix paths). */
async function economyCommand(ctx) {
  const handlers = {
    balance: cmdBalance,
    daily: cmdDaily,
    work: cmdWork,
    deposit: cmdDeposit,
    withdraw: cmdWithdraw,
    pay: cmdPay,
    shop: cmdShop,
    buy: cmdBuy,
    inventory: cmdInventory,
    admin: cmdAdmin,
  };
  const handler = handlers[ctx.subcommand.name];
  if (!handler) return ctx.sendError('economy.usage', {}, {}, { ephemeral: true });
  return handler(ctx);
}

async function cmdBalance(ctx) {
  const target = ctx.getMember('user', ctx.member) || ctx.member;
  if (!target || !ctx.guild) return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  const { wallet, bank } = await economyService.getBalances(ctx.guildId, target.user.id);
  const embed = new EmbedBuilder().setColor(COLORS.primary)
    .setTitle(ctx.t('economy.balanceTitle', { username: target.user.tag }))
    .addFields(
      { name: ctx.t('economy.wallet'), value: `${wallet.toLocaleString()} ${ctx.t('economy.currency')}`, inline: true },
      { name: ctx.t('economy.bank'), value: `${bank.toLocaleString()} ${ctx.t('economy.currency')}`, inline: true },
      { name: ctx.t('economy.net'), value: `${(wallet + bank).toLocaleString()} ${ctx.t('economy.currency')}`, inline: true },
    )
    .setFooter({ text: ctx.t('common.defaultFooter') })
    .setTimestamp();
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdDaily(ctx) {
  const econ = (ctx.guildConfig && ctx.guildConfig.economy) || {};
  const account = await economyService.getAccount(ctx.guildId, ctx.user.id);
  const last = account.lastDaily || 0;
  const day = 24 * 60 * 60 * 1000;
  if (Date.now() - last < day) {
    const remaining = day - (Date.now() - last);
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    return ctx.sendError('economy.dailyAlready', { time: `${h}h ${m}m` }, {}, { ephemeral: true });
  }
  // Trước đây hard-code 500, bỏ qua economy.dailyAmount của guild.
  const amount = Math.max(1, Math.trunc(econ.dailyAmount) || 500);
  await economyService.addWallet(ctx.guildId, ctx.user.id, amount);
  await economyService.markDaily(ctx.guildId, ctx.user.id);
  return ctx.sendSuccess('economy.dailyClaimed', { amount: amount.toLocaleString(), currency: ctx.t('economy.currency') }, { ephemeral: true });
}

async function cmdWork(ctx) {
  const econ = (ctx.guildConfig && ctx.guildConfig.economy) || {};
  const cooldownMs = (econ.workCooldownMinutes || 10) * 60 * 1000;
  const account = await economyService.getAccount(ctx.guildId, ctx.user.id);
  const last = account.lastWork || 0;
  if (Date.now() - last < cooldownMs) {
    const remaining = cooldownMs - (Date.now() - last);
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    return ctx.sendError('economy.workCooldown', { time: `${m}m ${s}s` }, {}, { ephemeral: true });
  }
  const min = econ.workMin || 50;
  const max = econ.workMax || 250;
  const amount = Math.floor(min + Math.random() * (max - min + 1));
  await economyService.addWallet(ctx.guildId, ctx.user.id, amount);
  await economyService.markWork(ctx.guildId, ctx.user.id);
  return ctx.sendSuccess('economy.workEarned', { amount: amount.toLocaleString(), currency: ctx.t('economy.currency') }, { ephemeral: true });
}

async function cmdPay(ctx) {
  const target = ctx.getMember('user');
  if (!target || !ctx.guild) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });
  if (target.user.id === ctx.user.id) return ctx.sendError('economy.giveSelf', {}, {}, { ephemeral: true });
  const amount = ctx.getInt('amount');
  if (!amount || amount <= 0) return ctx.sendError('economy.amountInvalid', {}, {}, { ephemeral: true });
  const result = await economyService.transfer(ctx.guildId, ctx.user.id, target.user.id, amount);
  if (!result) {
    const { wallet } = await economyService.getBalances(ctx.guildId, ctx.user.id);
    return ctx.sendError('economy.insufficient', { balance: wallet.toLocaleString(), amount }, {}, { ephemeral: true });
  }
  return ctx.sendSuccess('economy.giveSuccess', { amount: amount.toLocaleString(), currency: ctx.t('economy.currency'), user: target.user.tag }, { ephemeral: true });
}

async function cmdDeposit(ctx) {
  const amount = ctx.getInt('amount');
  if (!amount || amount <= 0) return ctx.sendError('economy.amountInvalid', {}, {}, { ephemeral: true });
  const result = await economyService.deposit(ctx.guildId, ctx.user.id, amount);
  if (!result) return ctx.sendError('economy.depositTooMuch', {}, {}, { ephemeral: true });
  return ctx.sendSuccess('economy.deposit', { amount: amount.toLocaleString(), currency: ctx.t('economy.currency') }, { ephemeral: true });
}

async function cmdWithdraw(ctx) {
  const amount = ctx.getInt('amount');
  if (!amount || amount <= 0) return ctx.sendError('economy.amountInvalid', {}, {}, { ephemeral: true });
  const result = await economyService.withdraw(ctx.guildId, ctx.user.id, amount);
  if (!result) return ctx.sendError('economy.withdrawTooMuch', {}, {}, { ephemeral: true });
  return ctx.sendSuccess('economy.withdraw', { amount: amount.toLocaleString(), currency: ctx.t('economy.currency') }, { ephemeral: true });
}

async function cmdShop(ctx) {
  // Trước đây luôn hiện "cửa hàng trống" dù config.economy.shop có item.
  const econ = (ctx.guildConfig && ctx.guildConfig.economy) || {};
  const items = Array.isArray(econ.shop) ? econ.shop : [];
  const currency = ctx.t('economy.currency');
  const embed = new EmbedBuilder().setColor(COLORS.primary)
    .setTitle(ctx.t('economy.shopTitle', { server: ctx.guild ? ctx.guild.name : '' }))
    .setFooter({ text: ctx.t('common.defaultFooter') })
    .setTimestamp();
  if (!items.length) {
    embed.setDescription(ctx.t('economy.shopEmpty', { server: ctx.guild ? ctx.guild.name : '' }));
  } else {
    const lines = items.slice(0, 25).map((item) => {
      const role = item.roleId ? ` · ${ctx.t('economy.roleItem')}: <@&${item.roleId}>` : '';
      const desc = item.description ? `\n> ${item.description}` : '';
      return `**${item.name || item.id}** — ${Number(item.price).toLocaleString()} ${currency}${role}${desc}`;
    });
    embed.setDescription(lines.join('\n'));
  }
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdBuy(ctx) {
  const econ = (ctx.guildConfig && ctx.guildConfig.economy) || {};
  const items = Array.isArray(econ.shop) ? econ.shop : [];
  const wanted = (ctx.getString('item') || '').trim().toLowerCase();
  const item = items.find((i) => i.id === wanted
    || String(i.name || '').toLowerCase() === wanted
    || String(i.id).toLowerCase() === wanted);
  if (!item) return ctx.sendError('economy.itemNotFound', {}, {}, { ephemeral: true });
  const result = await economyService.purchase(ctx.guildId, ctx.user.id, item);
  if (!result.ok) {
    if (result.reason === 'insufficient') {
      const { wallet } = await economyService.getBalances(ctx.guildId, ctx.user.id);
      return ctx.sendError('economy.insufficient', { balance: wallet.toLocaleString(), amount: Number(item.price).toLocaleString() }, {}, { ephemeral: true });
    }
    return ctx.sendError('economy.itemNotFound', {}, {}, { ephemeral: true });
  }
  // Item có roleId → bot grant role (không để lỗi role làm mất tiền:
  // purchase đã trừ tiền, nếu grant role lỗi thì hoàn tiền).
  if (item.roleId) {
    const member = ctx.member || await ctx.guild.members.fetch(ctx.user.id).catch(() => null);
    if (member) {
      const role = ctx.guild.roles.cache.get(item.roleId);
      try {
        if (role) await member.roles.add(role, 'Economy shop purchase');
      } catch {
        // Hoàn tiền khi không cấp được role (hierarchy/thiếu quyền).
        await economyService.addWallet(ctx.guildId, ctx.user.id, item.price);
        return ctx.sendError('economy.roleGrantFailed', {}, {}, { ephemeral: true });
      }
    }
  }
  return ctx.sendSuccess('economy.bought', { item: item.name || item.id, price: Number(item.price).toLocaleString(), currency: ctx.t('economy.currency') }, { ephemeral: true });
}

async function cmdInventory(ctx) {
  const target = ctx.getMember('user', ctx.member) || ctx.member;
  if (!target || !ctx.guild) return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  const account = await economyService.getAccount(ctx.guildId, target.user.id);
  const items = Array.isArray(account.inventory) && account.inventory.length ? account.inventory : [];
  const embed = new EmbedBuilder().setColor(COLORS.primary)
    .setTitle(ctx.t('economy.inventoryTitle', { username: target.user.tag }))
    .setDescription(items.length ? items.map((i) => `${i.name || i.id} ×${i.quantity}`).join('\n') : ctx.t('economy.inventoryEmpty'))
    .setFooter({ text: ctx.t('common.defaultFooter') })
    .setTimestamp();
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdAdmin(ctx) {
  // Trước đây KHÔNG có check quyền ở đây (command-level là 'member') →
  // mọi member đều tự `/economy admin add` đúc tiền.
  if (!ctx.member?.permissions?.has('ManageGuild')) return ctx.sendError('common.noPermissions', {}, {}, { ephemeral: true });
  const target = ctx.getMember('user');
  if (!target || !ctx.guild) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });
  const action = ctx.getString('action');
  const amount = ctx.getInt('amount');
  if (amount === null || amount === undefined) return ctx.sendError('economy.amountInvalid', {}, {}, { ephemeral: true });
  try {
    switch (action) {
      case 'add': {
        const added = await economyService.addWallet(ctx.guildId, target.user.id, amount);
        if (!added) return ctx.sendError('economy.amountInvalid', {}, {}, { ephemeral: true });
        return ctx.sendSuccess('economy.adminAdd', { user: target.user.tag, amount: amount.toLocaleString(), currency: ctx.t('economy.currency') }, { ephemeral: true });
      }
      case 'remove': {
        const removed = await economyService.removeWallet(ctx.guildId, target.user.id, amount);
        if (!removed) {
          // Trước đây trả `insufficient` với {balance: 0} hard-code — sai số dư thật.
          const { wallet } = await economyService.getBalances(ctx.guildId, target.user.id);
          return ctx.sendError('economy.insufficient', { balance: wallet.toLocaleString(), amount: amount.toLocaleString() }, {}, { ephemeral: true });
        }
        return ctx.sendSuccess('economy.adminRemove', { user: target.user.tag, amount: amount.toLocaleString(), currency: ctx.t('economy.currency') }, { ephemeral: true });
      }
      case 'set': {
        const set = await economyService.setWallet(ctx.guildId, target.user.id, amount);
        if (!set) return ctx.sendError('economy.amountInvalid', {}, {}, { ephemeral: true });
        return ctx.sendSuccess('economy.adminSet', { user: target.user.tag, amount: Math.max(0, amount).toLocaleString(), currency: ctx.t('economy.currency') }, { ephemeral: true });
      }
      default:
        return ctx.sendError('economy.usage', {}, {}, { ephemeral: true });
    }
  } catch (error) {
    // Trước đây catch {} nuốt mọi lỗi (kể cả lỗi DB) — log để debug được.
    logger.error('economy', `admin ${action} failed: ${error.stack || error}`);
    return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  }
}

function resolvePrefixOptions(ctx, sub, args) {
  if (sub === 'balance') {
    const user = ctx.client?.users?.resolve(args[0]) || ctx.client?.guilds?.cache?.get(ctx.guildId)?.members?.resolve(args[0]);
    return { options: { user: user || null } };
  }
  if (sub === 'pay') {
    const user = ctx.client?.users?.resolve(args[0]) || ctx.client?.guilds?.cache?.get(ctx.guildId)?.members?.resolve(args[0]);
    if (!user) return { error: 'common.memberNotFound', options: {} };
    const amount = parseInt(args[1], 10);
    return { options: { user, amount: isNaN(amount) ? null : amount } };
  }
  if (sub === 'deposit' || sub === 'withdraw') {
    const amount = parseInt(args[0], 10);
    return { options: { amount: isNaN(amount) ? null : amount } };
  }
  if (sub === 'inventory') {
    const user = ctx.client?.users?.resolve(args[0]) || ctx.client?.guilds?.cache?.get(ctx.guildId)?.members?.resolve(args[0]);
    return { options: { user: user || null } };
  }
  if (sub === 'buy') {
    const wanted = (args[0] || '').trim();
    return wanted ? { options: { item: wanted } } : { error: 'economy.itemNotFound', options: {} };
  }
  return { options: {} };
}

