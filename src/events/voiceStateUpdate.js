/**
 * voiceStateUpdate — voice join / leave / move (spec §4, category `voice`).
 * discord.js v14 event args: (oldState, newState)
 *
 * Only channel changes are reported: mute/deaf toggles fire the same event and
 * would otherwise flood the log. Bot members are skipped because music bots
 * join and leave constantly — see the README if a server wants them included.
 */
const loggingService = require('../services/loggingService');
const { COLORS } = require('../config/constants');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(client, oldState, newState, ctx) {
    const guild = (newState && newState.guild) || (oldState && oldState.guild);
    if (!guild) return;

    const from = oldState ? oldState.channelId : null;
    const to = newState ? newState.channelId : null;
    if (from === to) return; // mute/deaf/stream change only

    const member = (newState && newState.member) || (oldState && oldState.member);
    if (!member || !member.user || member.user.bot) return;

    const titleKey = !from
      ? 'logging.events.voiceJoin'
      : !to
        ? 'logging.events.voiceLeave'
        : 'logging.events.voiceMove';
    const color = !from ? COLORS.success : !to ? COLORS.warning : COLORS.primary;

    const fields = [{ nameKey: 'logging.fields.user', value: `${member.user.tag} (<@${member.id}>)`, inline: true }];
    if (from) fields.push({ nameKey: 'logging.fields.from', value: `<#${from}>`, inline: true });
    if (to) fields.push({ nameKey: 'logging.fields.to', value: `<#${to}>`, inline: true });

    await loggingService.sendLog(guild.id, 'voice', { titleKey, fields, color });
  },
};
