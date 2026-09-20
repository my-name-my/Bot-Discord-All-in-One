# Events

Discord event → service hook (§25 PROMT).

| File | Event | Việc làm |
|---|---|---|
| `clientReady.js` (`ready.js`) | `clientReady` (v15) | Presence, **đăng ký guild slash**, clear global, `restore()` timers |
| `guildCreate.js` | `guildCreate` | `ensure` config + đăng ký slash cho guild mới |
| `guildDelete.js` | `guildDelete` | Giữ config (rejoin không mất setting) |
| `messageCreate.js` | `messageCreate` | AutoMod → prefix parse → XP → command |
| `interactionCreate.js` | `interactionCreate` | Slash → `commandHandler`; button/select/modal → `componentHandler` |
| `shardError.js` | `shardError` | Log, không crash |

## Lưu ý discord.js v15

- Event `ready` đã đổi tên thành **`clientReady`** (emit với arg `client`). EventLoader gọi `execute(client, ...emittedArgs, ctx)` nên handler ready có signature `execute(client, emittedClient, ctx)`. Sai signature → `ctx` lệch → slash body rỗng (đã từng gây bug "Registered 0 slash command(s)").
- Thêm event mới: tạo `src/events/<tên>.js` export `{ name, once?, execute(client, ...args, ctx) }`, restart là tự đăng ký.
