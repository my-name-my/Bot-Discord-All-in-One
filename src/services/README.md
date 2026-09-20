# Services

Business logic dùng chung, tái sử dụng giữa slash/prefix/component (§26.3 PROMT).

| Service | Dùng bởi | Persist |
|---|---|---|
| `moderationService` | ban/kick/timeout/… | case log (DB/JSON) |
| `warningService` | warn/warnings/unwarn/clearwarns | warns per guild |
| `automodService` | messageCreate + guildMemberAdd hook | guild config + `automod_state` |
| `loggingService` | mọi service + mọi event log | guild log channels |
| `guildConfigService` | config, prefix, i18n, module gate | guild document |
| `levelService` | levels, profile, messageCreate XP | xp per (guild,user) |
| `economyService` | economy, profile | wallet/bank/inventory |
| `giveawayService` | giveaways + interaction | giveaways + entries |
| `roleMenuService` | rolemenu + interaction | menus |
| `ticketService` | tickets + interaction | tickets |
| `welcomeService` | welcome/goodbye events | guild config |
| `permissionService` | commandHandler gate | role-tier map |
| `cooldownService` | commandHandler, daily/work | memory |
| `i18nService` | `ctx.t()` | `locales/*.json` |

## Nguyên tắc

- Service không import command; command gọi service — 1 chiều, tránh circular.
- Timer-based service (`giveaway`, `tempRole`) phải có `setClient(client)` + `restore(client)` để sống sót sau restart.
- Thêm service mới: tạo file, lazy-require trong `index.js` ctx.services, không sửa API cũ (§26.12–13).

## Moderation (`moderationService` + `warningService`)

Điểm vào duy nhất cho hành động Discord: `ban` / `kick` / `timeout` / `removeTimeout` /
`addWarning` / `removeWarning` / `bulkDelete` / `setLock` / `setSlowmode` — mọi command
moderation gọi service, không tự gọi Discord API (§26.3 PROMT).

- `canModerate(moderator, target)`: chặn tự phạt mình, owner luôn qua, so sánh
  `roles.highest.position`. Plain User (đã rời server) không có role → luôn dưới mod.
- `botCanAct(guild, target)`: so sánh role bot với target; plain User bỏ qua (không còn hierarchy).
- `ban()` chấp nhận cả GuildMember lẫn plain User → ban được user đã rời server bằng `guild.members.ban(userId)`.
- `applyWarnEscalation(guild, member, total, config)`: thang leo thang dùng chung `/warn` + AutoMod
  (`config.moderation.warnAutoPunish`), fail-safe khi thiếu `moderatable`/`kickable`/`bannable`.
- `warningService`: `getCases` / `addCase` (đánh số tăng dần, không reuse số đã xóa) /
  `removeCase` / `clearCases`, key `{guildId}:{userId}`.
- Kiểm thử: `npm run test:moderation`.

## Logging (`loggingService`)

Điểm vào duy nhất: `sendLog(guildId, category, payload)` — mọi service/event gọi hàm này, không tự gửi embed.

- Chọn kênh: `logging.categories[category]` → fallback `logging.defaultChannelId` → bỏ qua nếu chưa cấu hình,
  `logging.enabled === false`, hoặc bot thiếu `SendMessages`/`EmbedLinks`.
- i18n: `payload.titleKey` và `field.nameKey` được dịch **bên trong** `sendLog` theo `config.language`,
  nên event không cần tự đọc config chỉ để lấy chuỗi.
- `diff(before, after, { property: 'logging.fields.x' })` → mảng field "Trước → Sau" cho thuộc tính đã đổi.
- `findExecutor(guild, AuditLogEvent.X, targetId)` (`src/utils/auditLog.js`) lấy người thực hiện từ audit log
  cho các thay đổi không có moderator (nickname, role, channel); thiếu quyền thì trả `null`.
- Chi tiết đầy đủ + bảng "ai ghi log cái gì" (chống log trùng): `src/commands/logging/README.md`.
- Kiểm thử: `npm run test:logging`.

## AutoMod (`automodService`)

Điểm vào: `messageCreate` → `handleMessage(message, ctx)` · `guildMemberAdd` → `handleJoin(member)` · boot → `restore(client)`.

Cấu hình per-guild nằm ở `config.automod`:

| Khoá | Ý nghĩa |
|---|---|
| `enabled` | Công tắc tổng (mặc định `false`) |
| `ignoredChannelIds` / `ignoredRoleIds` / `ignoredUserIds` | Ngoại lệ; member tier ≥ mod luôn được miễn |
| `punishments.deleteMessage` | Xoá tin nhắn vi phạm (mặc định `true`) |
| `punishments.timeoutMinutes` | Thời lượng timeout cho `action: 'timeout'` |
| `rules.<rule>.enabled` | Bật/tắt từng rule |
| `rules.<rule>.action` | `delete` \| `warn` \| `timeout` \| `kick` \| `ban` |
| `rules.<rule>.<ngưỡng>` | `maxMessages`, `windowSeconds`, `maxMentions`, `maxEmojis`, `minLength`, `maxPercent`, `maxJoins`, `lockdownMinutes` |
| `moderation.warnAutoPunish` | Thang leo thang `{ count, action, durationMinutes }` (dùng chung với `/warn`) |

Rule: `antiSpam`, `antiDuplicate`, `antiLink` (+`allowlist`), `antiInvite`, `antiMention` (đếm **cả user lẫn role mention**), `badWords` (+`words`), `capsFilter`, `emojiSpam`, `massJoin`.

`massJoin` chạy ở `guildMemberAdd` và có `action` riêng: `lockdown` (khóa `@everyone`) hoặc `alert` (chỉ gửi log cho staff, không đổi quyền).

### Restart resilience (BẮT BUỘC giữ)

`lockDown()` xoá quyền `@everyone` nên **không được phép mất trạng thái**. Service ghi collection `automod_state`:

```json
{ "lockdown": { "until": 1730000000000, "previous": ["ViewChannel", "SendMessages"] },
  "joins": [1730000000000] }
```

`restore(client)` (gọi từ `events/ready.js`) khi boot sẽ:

1. Nạp lại cửa sổ join → raid đang diễn ra vẫn được đếm tiếp.
2. Lockdown đã hết hạn trong lúc downtime → mở khóa ngay bằng snapshot đã lưu.
3. Lockdown còn hạn → re-arm timer cho phần thời gian còn lại.
4. Bot đã rời guild → xoá state (không giữ rác).

Bỏ bước này ⇒ quyền `@everyone` bị khoá vĩnh viễn sau một lần restart giữa lockdown.

Vì cùng lý do, `lockDown()` **persist trước khi xoá quyền** và **abort** nếu ghi thất bại (trả `{ ok: false, reason: 'state-not-persisted' }`, gửi log cảnh báo, không đụng vào quyền). Trường hợp "chưa init database" (test/pre-boot) vẫn cho chạy để không phá unit test.

### Kiểm thử

```bash
npm run test:automod          # rule detection + exempt + exports
npm run test:lockdown         # vòng lockDown → unlockDown (không mất quyền)
npm run test:automod-restart  # restart giữa lockdown → re-arm / mở khóa / abort khi DB lỗi
```

