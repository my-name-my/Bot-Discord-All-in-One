# Moderation

Quản lý server: ban / kick / timeout / warn / purge / lock / slowmode / nick / role (§2 PROMT).

## Commands

| Slash | Prefix | Quyền user | Quyền bot | Mô tả |
|---|---|---|---|---|
| `/ban <user> [reason] [delete_days]` | `!ban <user> [reason]` | mod | BanMembers | Ban member |
| `/unban <user_id> [reason]` | `!unban <id> [reason]` | mod | BanMembers | Gỡ ban |
| `/kick <user> [reason]` | `!kick <user> [reason]` | mod | KickMembers | Kick member |
| `/timeout <user> <duration> [reason]` | `!timeout <user> <dur> [reason]` | mod | ModerateMembers | Timeout (mute) có thời hạn |
| `/untimeout <user> [reason]` | `!untimeout <user>` | mod | ModerateMembers | Gỡ timeout |
| `/warn <user> [reason]` | `!warn <user> [reason]` | mod | ModerateMembers | Cảnh cáo, lưu case |
| `/warnings [user]` | `!warnings [user]` | mod | — | Xem lịch sử warn |
| `/unwarn <user> <case>` | `!unwarn <user> <case>` | mod | — | Xóa 1 case warn |
| `/clearwarns <user>` | `!clearwarns <user>` | mod | — | Xóa toàn bộ warn |
| `/purge <amount>` | `!purge <n>` | mod | ManageMessages | Xóa hàng loạt (tối đa theo limit) |
| `/lock [channel]` | `!lock [#kênh]` | mod | ManageChannels | Khóa kênh |
| `/unlock [channel]` | `!unlock [#kênh]` | mod | ManageChannels | Mở khóa kênh |
| `/slowmode [seconds] [channel]` | `!slowmode <giây>` | mod | ManageChannels | Slowmode (0 = tắt) |
| `/nick <user> [nickname\|reset]` | `!nick <user> [nick]` | mod | ManageNicknames | Đổi nickname |
| `/role add <user> <role>` | `!role add <user> <role>` | admin | ManageRoles | Gán role |
| `/role remove <user> <role>` | `!role remove <user> <role>` | admin | ManageRoles | Gỡ role |

## Cách hoạt động

- Mỗi lệnh là 1 file trong `src/commands/moderation/*.js`, export `{ name, description, category, aliases, permissions: { tier, bot }, run(ctx) }`.
- `run(ctx)` dùng chung cho cả slash và prefix — không duplicate logic (§26.4 PROMT).
- Permission check 2 lớp: tier của user (`permissionService`) + quyền của bot trong guild. Thiếu → trả lỗi i18n, không thực thi (§26.5–6).
- Mọi hành động ghi case qua `moderationService` / `warningService` và forward sang `loggingService` nếu bật log (§4 PROMT).
- Bot kiểm tra role hierarchy trước khi tác động member/role (§6 PROMT).

## Cách thêm lệnh mới

1. Tạo file `src/commands/moderation/<ten>.js` theo mẫu `ban.js`.
2. Khai báo `name`, `description`, `permissions.tier`, `permissions.bot`, `slash: true`, `guildOnly: true`.
3. Viết `run(ctx)` lấy input qua `ctx.getUser()`, `ctx.getString()`, `ctx.args`.
4. Restart bot (CommandLoader tự phát hiện) hoặc `node scripts/deploy-commands.js --guild <id>`.

## Cách sửa lỗi thường gặp

| Triệu chứng | Nguyên nhân | Sửa |
|---|---|---|
| `Missing Permissions` | Bot thiếu quyền / role bot thấp hơn target | Kéo role bot lên cao, cấp quyền trong Server Settings → Roles |
| Lệnh không hiện trong `/` | Chưa deploy guild commands | `node scripts/deploy-commands.js --guild <id>` |
| Warn không lưu | DB chưa init | Kiểm tra `data/db/*.json` hoặc `DATABASE_URL` |
