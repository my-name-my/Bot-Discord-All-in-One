const roleMenuService = require('../../services/roleMenuService');

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟',
  '🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯'];

function numberEmoji(index) {
  return NUMBER_EMOJIS[index] || null;
}

function parseRoles(ctx, raw) {
  const guild = ctx.guild;
  const ids = String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const id of ids) {
    let role = guild.roles.cache.get(id.replace(/[<@&>]/g, ''));
    if (!role) role = guild.roles.cache.find((r) => r.name.toLowerCase() === id.toLowerCase());
    if (role) out.push({ label: role.name, description: '', emoji: '🔹', roleId: role.id });
  }
  return out;
}

module.exports = {
  name: 'rolemenu',
  description: 'Create and manage role-assignment menus',
  category: 'roles',
  aliases: ['reactionrole', 'rrmenu'],
  usage: 'rolemenu <create|delete|list>',
  permissions: { tier: 'admin', bot: ['ManageRoles'] },
  guildOnly: true,
  slash: true,
  subcommands: [
    { name: 'create', description: 'Create a role menu', options: [{ name: 'type', type: 'string', description: 'select | buttons | reaction', required: true, choices: [{ name: 'select', value: 'select' }, { name: 'buttons', value: 'buttons' }, { name: 'reaction', value: 'reaction' }] }, { name: 'channel', type: 'channel', description: 'Channel to post in', required: true }, { name: 'title', type: 'string', description: 'Menu title', required: true }, { name: 'roles', type: 'string', description: 'Comma-separated roles', required: true }] },
    { name: 'delete', description: 'Delete a role menu message', options: [{ name: 'message', type: 'string', description: 'Message id of the menu', required: true }] },
    { name: 'list', description: 'List role menus in this server' },
  ],
  async run(ctx) {
    const sub = ctx.subcommand && ctx.subcommand.name;
    if (sub === 'create') return create(ctx);
    if (sub === 'delete') return del(ctx);
    if (sub === 'list') return list(ctx);
    return ctx.sendError('common.error', {}, {}, { ephemeral: true });
  },
};

async function create(ctx) {
  const type = ctx.getString('type', 'select');
  const channel = ctx.getChannel('channel');
  const title = ctx.getString('title');
  const options = parseRoles(ctx, ctx.getString('roles'));
  if (!channel?.isTextBased()) return ctx.sendError('common.channel', {}, {}, { ephemeral: true });
  if (!options.length) return ctx.sendError('roles.noRolesFound', {}, {}, { ephemeral: true });
  if (type === 'buttons' && options.length > 25) return ctx.sendError('roles.menuTooMany', {}, {}, { ephemeral: true });
  if (type === 'reaction' && options.length > 20) return ctx.sendError('roles.menuTooMany', {}, {}, { ephemeral: true });
  if (type === 'select') {
    await roleMenuService.createSelect({ guild: ctx.guild, channel, title, placeholder: ctx.t('roles.menuPlaceholder'), options });
  } else if (type === 'reaction') {
    const reactionOptions = options.map((opt, i) => ({ ...opt, emoji: numberEmoji(i) || opt.emoji }));
    await roleMenuService.createReactions({ guild: ctx.guild, channel, title, options: reactionOptions });
  } else {
    await roleMenuService.createButtons({ guild: ctx.guild, channel, title, options });
  }
  return ctx.sendSuccess('roles.menuCreated');
}

async function del(ctx) {
  const messageId = ctx.getString('message');
  await roleMenuService.remove(messageId);
  return ctx.sendSuccess('roles.menuDeleted');
}

async function list(ctx) {
  const menus = await roleMenuService.list(ctx.guildId);
  if (!menus.length) return ctx.sendInfo('common.success', {}, { content: '📝 No role menus.' });
  const lines = menus.map((m, i) => `${i + 1}. ${m.type} — <#${m.channelId}> \`msg:${m.messageId}\``);
  return ctx.sendInfo('roles.menuList', {}, { content: `📝 Role menus:\n${lines.join('\n')}` });
}
