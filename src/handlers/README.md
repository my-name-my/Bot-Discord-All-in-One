# Handlers (core)

Lõi routing: load command/event, parse prefix, build slash, route component (§25 PROMT).

| File | Vai trò |
|---|---|
| `commandLoader.js` | Quét `src/commands/**`, validate `{ name, run() }`, map name/alias → command, nhóm theo category |
| `eventLoader.js` | Quét `src/events/*.js`, `client.on(name, (...a) => execute(client, ...a, ctx))` |
| `commandHandler.js` | Gate (module on/off, permission tier, cooldown), gọi `run(ctx)`, catch lỗi → `loggingService` |
| `prefixParser.js` | Parse `!cmd sub args` (hỗ trợ quote), tách subcommand |
| `slashBuilder.js` | Command definition → Discord API JSON (subcommands, options, contextMenu) |
| `componentHandler.js` | Map `customId` (`module:action:...`) → feature handler; modal `modal:module:action` |
| `context.js` | `Context` wrapper thống nhất slash/prefix/context-menu (`reply`, `getString`, `t`, `sendSuccess/Error`) |

## Thêm command mới (mẫu chung)

```js
module.exports = {
  name: 'mycommand',
  description: 'Mô tả ngắn',
  category: '<tên thư mục>',
  aliases: ['mc'],
  permissions: { tier: 'mod', bot: ['ManageMessages'] },
  guildOnly: true, slash: true,
  subcommands: [{ name: 'sub', description: '...', options: [] }],
  async run(ctx) { /* dùng ctx.getString/getUser/args, ctx.sendSuccess(...) */ },
};
```

Restart bot → loader tự nhận. Deploy slash guild: `node scripts/deploy-commands.js --guild <id>`.

## Quy ước customId

`module:action:extra…` cho button/select; `modal:module:action:extra` cho modal. Handler đăng ký trong `src/interactions/<module>.js` qua `registerAll()`.
