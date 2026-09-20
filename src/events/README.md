# Events

Discord event → service hook (§25 PROMT).

| File | Event | Việc làm |
|---|---|---|
| `clientReady.js` (`ready.js`) | `clientReady` (v15) | Presence, **đăng ký guild slash**, clear global, `restore()` timers + **AutoMod lockdown `restore()`** |
| `guildCreate.js` | `guildCreate` | `ensure` config + đăng ký slash cho guild mới |
| `guildDelete.js` | `guildDelete` | Giữ config (rejoin không mất setting) |
| `guildMemberAdd.js` | `guildMemberAdd` | **AutoMod `handleJoin`** (mass-join/raid) → `welcomeService.sendWelcome` (welcome + auto role + log) |
| `guildMemberRemove.js` | `guildMemberRemove` | `welcomeService.sendGoodbye` (goodbye + leave log) |
| `messageCreate.js` | `messageCreate` | Đọc guild config **1 lần** → AutoMod → prefix parse → XP → command |
| `interactionCreate.js` | `interactionCreate` | Slash → `commandHandler`; button/select/modal → `componentHandler` |
| `shardError.js` | `shardError` | Log, không crash |
| `messageDelete.js` | `messageDelete` | Log xoá tin nhắn (bỏ qua bot/partial) |
| `messageUpdate.js` | `messageUpdate` | Log sửa nội dung (bỏ qua pin/embed edit) |
| `messageDeleteBulk.js` | `messageDeleteBulk` | Log xoá hàng loạt (purge, bot khác) |
| `guildMemberUpdate.js` | `guildMemberUpdate` | Log đổi biệt danh (**chủ sở hữu duy nhất**, có audit log) |
| `roleCreate.js` / `roleDelete.js` / `roleUpdate.js` | `roleCreate|Delete|Update` | Log CRUD vai trò + diff quyền |
| `channelCreate.js` / `channelDelete.js` / `channelUpdate.js` | `channelCreate|Delete|Update` | Log CRUD kênh + diff thuộc tính + **permission overwrites (lock/unlock)** |
| `voiceStateUpdate.js` | `voiceStateUpdate` | Log vào/rời/chuyển kênh thoại (bỏ mute/deaf, bỏ bot) |

## Ai ghi log cái gì (tránh log trùng)

Một sự kiện chỉ có **một** nơi phát log:

| Sự kiện | Chủ sở hữu |
|---|---|
| ban / unban / kick / timeout / untimeout / warn / unwarn | `moderationService` (có tên moderator) |
| nickname | `events/guildMemberUpdate.js` (có audit log) — `/nick` **không** log |
| message delete / edit / bulk | `events/messageDelete(Bulk).js`, `events/messageUpdate.js` |
| role / channel CRUD | `events/role*.js`, `events/channel*.js` |
| voice | `events/voiceStateUpdate.js` |
| join / leave member | `welcomeService` |
| AutoMod, ticket, giveaway | service tương ứng |

Thêm log vào command trong khi đã có event tương ứng ⇒ **log trùng**. Hãy kiểm tra bảng trên trước khi thêm.

## Thứ tự tham số (BẮT BUỘC đọc)

`EventLoader` gọi theo convention của discord.js:

```js
await event.execute(client, ...emittedArgs, ctx);
```

nên handler nhận: `execute(client, <arg của event>, ctx)`.

- `messageCreate` → `(client, message, ctx)`
- `guildMemberAdd` → `(client, member, ctx)`
- `guildCreate` → `(client, guild, ctx)`
- `clientReady` → `(client, emittedClient, ctx)` — vì discord.js emit kèm chính client

Sai thứ tự → `ctx` lệch vị trí, `ctx.services` undefined và handler chết im lặng.

## Lưu ý discord.js v15

- Event `ready` đã đổi tên thành **`clientReady`** (emit kèm arg `client`). discord.js 14.27 emit **cả hai** (`ready` deprecated + `clientReady`), nên dùng `clientReady` là an toàn ở cả 14 và 15.
- Thêm event mới: tạo `src/events/<tên>.js` export `{ name, once?, execute(client, ...args, ctx) }`, restart là tự đăng ký — không cần sửa file nào khác.
- Luôn `try/catch` trong handler và log qua `logger` thay vì `catch {}` rỗng: một `catch` rỗng từng che lỗi thiếu helper của AutoMod khiến nó chết hoàn toàn mà không có log.

