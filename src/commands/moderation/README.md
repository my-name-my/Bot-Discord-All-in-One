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
| `/role add <user> <role>` | `!role add <user> <role>` | admin | ManageRoles | Gán role (check hierarchy 2 chiều) |
| `/role remove <user> <role>` | `!role remove <user> <role>` | admin | ManageRoles | Gỡ role (báo info nếu member chưa có role) |
| `/role create <name>` | `!role create <name>` | admin | ManageRoles | Tạo role (validate màu hex, tên bắt buộc) |
| `/role delete <role>` | `!role delete <role>` | admin | ManageRoles | Xóa role (chặn @everyone + role managed) |

> Log create/delete do event `roleCreate`/`roleDelete` đảm nhiệm (kèm audit log) để tránh log trùng — xem `src/events/README.md`.

## Quy ước đã chốt trong module

- **Escalation ladder dùng chung** (`config.moderation.warnAutoPunish`): cả `/warn` thủ công và AutoMod đều gọi `moderationService.applyWarnEscalation()` — trước đây chỉ AutoMod leo thang nên warn tay không bao giờ escalate.
- **`/warnings` giới hạn 25 field** (Discord reject embed > 25 field): hiển thị 25 case mới nhất + footer báo tổng số.
- **`/purge` báo tin nhắn bị bỏ qua**: Discord không bulk-delete tin > 14 ngày tuổi — trả về `{ deleted, skipped }` và template `purgeSkipped` thay vì im lặng xóa thiếu.
- **Prefix resolve user không cache**: `message.mentions.users` luôn có user được mention dù member chưa cache → `!ban @user` vẫn chạy, `ban()` fallback sang `guild.members.ban(userId)` được.
- **`/ban` chấp nhận user đã rời server**: `getMember` thất bại → thử `getUser` + `guild.members.fetch()` → cuối cùng ban bằng user object thuần (không check hierarchy vì không còn role).

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
