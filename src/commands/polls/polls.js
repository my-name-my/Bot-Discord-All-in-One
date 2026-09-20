/**
 * Lệnh bình chọn — tạo poll. (spec §10)
 * Poll được tạo qua pollService và tự động đóng theo hẹn giờ.
 */
const { COLORS, LIMITS } = require('../../config/constants');
const { parseDuration, formatDuration } = require('../../utils/time');
const pollService = require('../../services/pollService');

module.exports = {
  name: 'poll',
  description: 'Poll commands',
  category: 'polls', aliases: ['polls'],
  usage: 'poll create <question> <options;separated> [duration] [anonymous] [multi]',
  cooldown: { seconds: 5, scope: 'user' }, permissions: { tier: 'member' },
  guildOnly: true, slash: true,
  subcommands: [
    { name: 'create', description: 'Create a poll', options: [
      { name: 'question', type: 'string', description: 'Question', required: true },
      { name: 'options', type: 'string', description: 'Options separated by ;', required: true },
      { name: 'duration', type: 'string', description: 'Duration e.g. 1h', required: false },
      { name: 'anonymous', type: 'bool', description: 'Hide voters', required: false },
      { name: 'multi', type: 'bool', description: 'Allow multiple votes', required: false },
    ] },
  ],
  async run(ctx) {
    if (!ctx.subcommand || !ctx.subcommand.name) {
      // Trường hợp prefix được xử lý tại đây
      return ctx.sendError('poll.usage', {}, {}, { ephemeral: true });
    }
    if (ctx.subcommand.name === 'create') return cmdCreate(ctx);
    return ctx.sendInfo('help.commandNotFound', { name: ctx.subcommand.name }, {}, { ephemeral: true });
  },
};

async function cmdCreate(ctx) {
  const question = ctx.getString('question');
  if (!question) return ctx.sendError('utility.pollNeedQuestion', {}, {}, { ephemeral: true });
  let optionsStr = ctx.getString('options', '');
  if (!optionsStr && ctx.message) {
    optionsStr = ctx.message.content.split(' ').slice(2).join(' ').split(';').join(';');
  }
  const options = String(optionsStr).split(';').map((s) => s.trim()).filter((s) => s).slice(0, LIMITS.pollMaxOptions);
  if (options.length < 2) return ctx.sendError('utility.pollNeedOptions', {}, {}, { ephemeral: true });
  const duration = parseDuration(ctx.getString('duration')) || 24 * 60 * 60 * 1000;
  const anonymous = ctx.getBool('anonymous');
  const multi = ctx.getBool('multi');
  if (!ctx.guild || !ctx.channel?.isTextBased()) return ctx.sendError('common.guildOnly', {}, {}, { ephemeral: true });
  await pollService.create({ guild: ctx.guild, channel: ctx.channel, hostId: ctx.user.id, question, options, anonymous, multi, durationMs: duration });
  return ctx.sendSuccess('utility.pollCreated', { channel: ctx.channel.toString() }, {}, { ephemeral: true });
}
