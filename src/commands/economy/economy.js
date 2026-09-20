const economyService = require('../../services/economyService');
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');

module.exports = {
  name: 'economy',
  description: 'Economy commands: balance, daily, work, deposit, withdraw, pay, shop, inventory, admin',
  category: 'economy',
  aliases: ['eco', 'bal'],
  usage: 'economy <balance|daily|work|deposit|withdraw|pay|shop|inventory|admin> [target] [amount]',
  cooldown: { seconds: 0, scope: 'user' },
  permissions: { tier: 'member', bot: ['ManageGuild'] },
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
    if (![/^(balance|bal|eco)$/, /^daily$/, /^work$/, /^deposit$/, /^withdraw$/, /^pay$/, /^shop$/, /^inventory$/, /^admin$/].some((r) => r.test(sub))) {
      return ctx.sendError('economy.usage', {}, {}, { ephemeral: false });
    }
    const options = resolvePrefixOptions(ctx, sub, args.slice(1));
    if (options.error) return ctx.sendError(options.error, {}, {}, { ephemeral: false });
    Object.assign(ctx.options, options.options);
    ctx.subcommand = { name: sub };
    return economyCommand(ctx);
  },
};

async function cmdBalance(ctx) {
  const target = ctx.getMember('user', ctx.member) || ctx.member;
  if (!target || !ctx.guild) return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  const { wallet, bank } = await economyService.getBalances(ctx.guildId, target.user.id);
  const embed = new EmbedBuilder().setColor(COLORS.primary)
    .setTitle(ctx.t('economy.balanceTitle', { user: target.user.tag }))
    .addFields(
      { name: ctx.t('economy.wallet'), value: `${wallet.toLocaleString()} ${ctx.t('economy.currency')}`, inline: true },
      { name: ctx.t('economy.bank'), value: `${bank.toLocaleString()} ${ctx.t('economy.currency')}`, inline: true },
    )
    .setFooter({ text: ctx.t('common.defaultFooter') })
    .setTimestamp();
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdDaily(ctx) {
  const account = await economyService.getAccount(ctx.guildId, ctx.user.id);
  const last = account.lastDaily || 0;
  const day = 24 * 60 * 60 * 1000;
  if (Date.now() - last < day) {
    const remaining = day - (Date.now() - last);
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    return ctx.sendError('economy.dailyCooldown', { time: `${h}h ${m}m` }, {}, { ephemeral: true });
  }
  const amount = 500;
  await economyService.addWallet(ctx.guildId, ctx.user.id, amount);
  await economyService.markDaily(ctx.guildId, ctx.user.id);
  return ctx.sendSuccess('economy.dailySuccess', { amount: amount.toString() }, { ephemeral: true });
}

async function cmdDeposit(ctx) {
  const amount = ctx.getInt('amount');
  if (!amount || amount <= 0) return ctx.sendError('economy.invalidAmount', {}, {}, { ephemeral: true });
  const result = await economyService.deposit(ctx.guildId, ctx.user.id, amount);
  if (!result) return ctx.sendError('economy.notEnough', {}, {}, { ephemeral: true });
  return ctx.sendSuccess('economy.depositSuccess', { amount: amount.toString() }, { ephemeral: true });
}

async function cmdWithdraw(ctx) {
  const amount = ctx.getInt('amount');
  if (!amount || amount <= 0) return ctx.sendError('economy.invalidAmount', {}, {}, { ephemeral: true });
  const result = await economyService.withdraw(ctx.guildId, ctx.user.id, amount);
  if (!result) return ctx.sendError('economy.notEnoughBank', {}, {}, { ephemeral: true });
  return ctx.sendSuccess('economy.withdrawSuccess', { amount: amount.toString() }, { ephemeral: true });
}

async function cmdShop(ctx) {
  const embed = new EmbedBuilder().setColor(COLORS.primary)
    .setTitle(ctx.t('economy.shopTitle'))
    .setDescription(ctx.t('economy.shopComingSoon'))
    .setFooter({ text: ctx.t('common.defaultFooter') })
    .setTimestamp();
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdInventory(ctx) {
  const target = ctx.getMember('user', ctx.member) || ctx.member;
  if (!target || !ctx.guild) return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  const account = await economyService.getAccount(ctx.guildId, target.user.id);
  const items = Array.isArray(account.inventory) && account.inventory.length ? account.inventory : [];
  const embed = new EmbedBuilder().setColor(COLORS.primary)
    .setTitle(ctx.t('economy.inventoryTitle', { user: target.user.tag }))
    .setDescription(items.length ? items.map((i) => `${i.name || i.id} ×${i.quantity}`).join('\n') : ctx.t('economy.emptyInventory'))
    .setFooter({ text: ctx.t('common.defaultFooter') })
    .setTimestamp();
  return ctx.reply({ embeds: [embed] }, { ephemeral: true });
}

async function cmdAdmin(ctx) {
  const target = ctx.getMember('user');
  if (!target || !ctx.guild) return ctx.sendError('common.memberNotFound', {}, {}, { ephemeral: true });
  const action = ctx.getString('action');
  const amount = ctx.getInt('amount');
  if (amount === null || amount === undefined) return ctx.sendError('economy.invalidAmount', {}, {}, { ephemeral: true });
  try {
    switch (action) {
      case 'add':
        await economyService.addWallet(ctx.guildId, target.user.id, Math.max(0, Math.trunc(amount)));
        return ctx.sendSuccess('economy.adminAdded', { user: target.user.tag, amount: Math.max(0, Math.trunc(amount)).toString() }, { ephemeral: true });
      case 'remove':
        const removed = await economyService.removeWallet(ctx.guildId, target.user.id, Math.max(0, Math.trunc(amount)));
        if (!removed) return ctx.sendError('economy.notEnough', {}, {}, { ephemeral: true });
        return ctx.sendSuccess('economy.adminRemoved', { user: target.user.tag, amount: Math.max(0, Math.trunc(amount)).toString() }, { ephemeral: true });
      case 'set':
        await economyService.setWallet(ctx.guildId, target.user.id, Math.max(0, Math.trunc(amount)));
        return ctx.sendSuccess('economy.adminSet', { user: target.user.tag, amount: Math.max(0, Math.trunc(amount)).toString() }, { ephemeral: true });
      default:
        return ctx.sendError('economy.usage', {}, {}, { ephemeral: true });
    }
  } catch {
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
  return { options: {} };
}

