# Logging

Ghi log sự kiện server ra kênh chỉ định bằng Embed (§4 PROMT).

## Commands

| Slash | Prefix | Quyền | Mô tả |
|---|---|---|---|
| `/log setup #kênh` | `!log setup #kênh` | admin | Đặt kênh log mặc định (bật logging) |
| `/log channel #kênh` | `!log channel #kênh` | admin | Y hệt `setup` (§4 liệt kê cả hai dạng) |
| `/log category <loại> [#kênh]` | `!log category ...` | admin | Đặt kênh riêng cho 1 loại; bỏ `#kênh` để xoá (dùng lại kênh mặc định) |
| `/log toggle <on\|off>` | `!log toggle ...` | admin | Bật/tắt toàn bộ logging |
| `/log list` | `!log list` | admin | Xem cấu hình hiện tại |

Loại log (`CATEGORIES`): `moderation`, `members`, `messages`, `roles`, `channels`, `voice`, `errors`.

Sự kiện được ghi: join/leave, ban/unban/kick/timeout/warn, message delete/edit/bulk-delete,
role create/delete/update, channel create/delete/update (gồm cả permission overwrite ⇒ lock/unlock),
nickname change, voice join/leave/move.

## Cách hoạt động

1. `src/services/loggingService.js` giữ client ref (`setClient`, gọi trong `src/index.js`).
2. Mọi nơi gọi `loggingService.sendLog(guildId, category, payload)`.
3. `sendLog` đọc guild config → chọn `logging.categories[category]`, fallback `logging.defaultChannelId`
   → kiểm tra bot có `SendMessages` + `EmbedLinks` → gửi **embed** (không gửi text thô).
4. Trả về im lặng (không throw) khi: chưa init, không có client, logging tắt, chưa đặt kênh, thiếu quyền.

### Payload

```js
await loggingService.sendLog(guildId, 'messages', {
  titleKey: 'logging.events.messageDelete',  // dịch theo ngôn ngữ của guild
  title: 'Literal title',                    // dùng khi không cần dịch (titleKey thắng nếu có cả hai)
  description: 'tuỳ chọn, cắt ở 4000 ký tự',
  fields: [
    { nameKey: 'logging.fields.author', value: '...', inline: true }, // nameKey → dịch
    { name: 'Literal', value: '...' },                                 // name → giữ nguyên
  ],
  thumbnail: 'https://...',
  color: COLORS.error,
});
```

`loggingService.diff(before, after, { property: 'logging.fields.x' })` tạo sẵn các field
"Trước → Sau" cho những thuộc tính thật sự đổi — dùng cho role/channel/member.

### Quy ước & bộ lọc (đọc trước khi sửa)

- **Không log trùng**: mỗi sự kiện chỉ do 1 nơi phát log — xem bảng trong `src/events/README.md`.
- Bot/self messages bị bỏ qua ở `messageDelete`/`messageUpdate` (panel ticket/giveaway được bot sửa liên tục).
- `messageUpdate` chỉ log khi **nội dung** đổi (pin, embed update, reaction đều emit event này).
- `voiceStateUpdate` bỏ qua mute/deaf và member là bot (music bot vào/ra liên tục).
- `guildMemberUpdate` chỉ xử lý nickname; timeout đã do `moderationService`/AutoMod log.
- Tên người thực hiện lấy từ **audit log** (`src/utils/auditLog.js`): chỉ nhận entry đúng target và
  trong ~15s gần nhất, nếu thiếu quyền `View Audit Log` thì hiển thị `—`. Delay chờ Discord ghi audit
  log chỉnh được bằng env `AUDIT_LOG_DELAY_MS` (test đặt `0`).

## Thêm một loại log mới

1. Thêm key vào `locales/vi.json` + `locales/en.json` (mục `logging.events.*`, label ở `logging.fields.*`).
2. Tạo event trong `src/events/<tên>.js` (xem `src/events/README.md` để biết thứ tự tham số).
3. Gọi `sendLog` với `titleKey` + `loggingService.diff(...)` — không hard-code chuỗi người dùng.
4. Nếu sự kiện cần moderator: dùng `findExecutor(guild, AuditLogEvent.X, targetId)`.
5. Chạy `npm run test:logging` (43 check) — test này phủ routing, i18n, diff và từng event handler.

