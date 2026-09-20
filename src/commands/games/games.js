const { EmbedBuilder } = require('discord.js');
const { COLORS, LIMITS } = require('../../config/constants');
const economyService = require('../../services/economyService');

const SUBCOMMANDS = [
  { name: 'coinflip', description: 'Flip a coin', options: [{ name: 'bet', type: 'int', description: 'Bet', required: false }] },
  { name: 'dice', description: 'Roll a dice', options: [{ name: 'bet', type: 'int', description: 'Bet', required: false }, { name: 'guess', type: 'int', description: 'Guess 1-6', required: false }] },
  { name: 'rps', description: 'Rock Paper Scissors', options: [{ name: 'choice', type: 'string', description: 'rock/paper/scissors', required: true, choices: [{ name: 'Rock', value: 'rock' }, { name: 'Paper', value: 'paper' }, { name: 'Scissors', value: 'scissors' }] }] },
  { name: 'guess', description: 'Guess 1-100', options: [{ name: 'bet', type: 'int', description: 'Bet', required: false }] },
  { name: 'quiz', description: 'Trivia quiz', options: [{ name: 'bet', type: 'int', description: 'Bet', required: false }] },
  { name: 'blackjack', description: 'Blackjack', options: [{ name: 'bet', type: 'int', description: 'Bet', required: true }] },
  { name: 'slots', description: 'Spin slots', options: [{ name: 'bet', type: 'int', description: 'Bet', required: true }] },
];

async function resolveBet(ctx, fallback) {
  const v = fallback !== undefined && fallback !== null ? fallback : ctx.getInt('bet');
  if (v === null || v === undefined || v === '') { await ctx.sendError('games.needBet', {}, {}, { ephemeral: true }); return null; }
  const bet = Math.trunc(v);
  if (bet < LIMITS.betMin || bet > LIMITS.betMax) { await ctx.sendError('games.invalidBet', { min: LIMITS.betMin.toString(), max: LIMITS.betMax.toString() }, {}, { ephemeral: true }); return null; }
  const bal = await economyService.getBalances(ctx.guildId, ctx.user.id);
  if (bal.wallet < bet) { await ctx.sendError('games.notEnough', {}, {}, { ephemeral: true }); return null; }
  return bet;
}
async function payout(ctx, bet, won) { if (won) await economyService.addWallet(ctx.guildId, ctx.user.id, bet); else await economyService.removeWallet(ctx.guildId, ctx.user.id, bet); }

async function cmdCoinflip(ctx) {
  const betInput = ctx.getInt('bet');
  if (betInput === null || betInput === undefined || betInput === '') {
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    return ctx.reply({ embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle('Coinflip').setDescription(`You got **${result}**!`)] }, { ephemeral: true });
  }
  const bet = await resolveBet(ctx, betInput);
  if (bet === null) return;
  const win = Math.random() < 0.5;
  await payout(ctx, bet, win);
  return ctx.reply({ embeds: [new EmbedBuilder().setColor(win ? COLORS.success : COLORS.error).setTitle('Coinflip').setDescription(win ? `You won **${bet}**!` : `You lost **${bet}**.`)] }, { ephemeral: true });
}

async function cmdDice(ctx) {
  const roll = Math.floor(Math.random() * 6) + 1;
  let msg = `You rolled **${roll}**.`;
  const betInput = ctx.getInt('bet');
  if (betInput !== null && betInput !== undefined && betInput !== '') {
    const bet = await resolveBet(ctx, betInput);
    if (bet === null) return;
    const guess = ctx.getInt('guess');
    const won = guess ? guess === roll : roll === 6;
    await payout(ctx, bet, won);
    msg += won ? ` +**${bet}**` : ` **-${bet}**`;
  }
  return ctx.reply({ embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle('Dice').setDescription(msg)] }, { ephemeral: true });
}

async function cmdRps(ctx) {
  const choice = ctx.getString('choice');
  const icons = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };
  const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
  const bot = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];
  let result = beats[choice] === bot ? 'win' : beats[bot] === choice ? 'lose' : 'tie';
  let msg = `You: ${icons[choice]} | Bot: ${icons[bot]}\n**${result.toUpperCase()}**`;
  const betInput = ctx.getInt('bet');
  if (betInput !== null && betInput !== undefined && betInput !== '' && result !== 'tie') {
    const bet = await resolveBet(ctx, betInput);
    if (bet === null) return;
    const won = result === 'win';
    await payout(ctx, bet, won);
    msg += won ? ` +**${bet}**` : ` **-${bet}**`;
  }
  return ctx.reply({ embeds: [new EmbedBuilder().setColor(result === 'win' ? COLORS.success : result === 'lose' ? COLORS.error : COLORS.neutral).setTitle('RPS').setDescription(msg)] }, { ephemeral: true });
}

async function cmdGuess(ctx) {
  const number = Math.floor(Math.random() * 100) + 1;
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle('Guess').setDescription('Number 1-100. 15s!');
  const msg = await ctx.reply({ embeds: [embed], fetchReply: true });
  const collector = msg.channel.createMessageCollector({ filter: (m) => m.author.id === ctx.user.id && !m.author.bot, time: 15000 });
  let bet = null;
  const betInput = ctx.getInt('bet');
  if (betInput !== null && betInput !== undefined && betInput !== '') { const r = await resolveBet(ctx, betInput); if (r === null) { collector.stop('bet'); return; } bet = r; }
  collector.on('collect', (m) => {
    const guess = parseInt(m.content, 10);
    if (Number.isNaN(guess)) { m.reply({ content: 'Enter a number!', allowedMentions: { repliedUser: false } }); return; }
    collector.stop('guessed');
    const won = guess === number;
    m.reply({ content: won ? `You won!${bet ? ` +**${bet}**` : ''}` : `Wrong! It was **${number}**.${bet ? ` **-${bet}**` : ''}` });
    if (bet) payout(ctx, bet, won).catch(() => {});
  });
}

async function cmdQuiz(ctx) { await ctx.sendError('games.comingSoon', {}, {}, { ephemeral: true }); }
async function cmdBlackjack(ctx) { await ctx.sendError('games.comingSoon', {}, {}, { ephemeral: true }); }

const handlers = { coinflip: cmdCoinflip, dice: cmdDice, rps: cmdRps, guess: cmdGuess, quiz: cmdQuiz, blackjack: cmdBlackjack, slots: cmdSlots };

module.exports = {
  name: 'games', description: 'Games commands', category: 'games', aliases: ['game'],
  usage: 'games <coinflip|dice|rps|guess|quiz|blackjack|slots>',
  cooldown: { seconds: 3, scope: 'user' }, permissions: { tier: 'member' },
  guildOnly: true, slash: true, subcommands: SUBCOMMANDS,
  async run(ctx) {
    if (!ctx.subcommand || !ctx.subcommand.name) return ctx.sendInfo('help.commandNotFound', { name: 'games' }, {}, { ephemeral: true });
    const handler = handlers[ctx.subcommand.name];
    return handler ? handler(ctx) : ctx.sendInfo('help.commandNotFound', { name: ctx.subcommand.name }, {}, { ephemeral: true });
  },
};

async function cmdSlots(ctx) { await ctx.sendError('games.comingSoon', {}, {}, { ephemeral: true }); }
