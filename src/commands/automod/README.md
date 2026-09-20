# AutoMod

Lọc tự động: spam, flood, link, invite, mention-spam, bad-word, caps, emoji (§3 PROMT).

## Commands

| Slash | Prefix | Quyền | Mô tả |
|---|---|---|---|
| `/automod status` | `!automod status` | admin | Xem cấu hình hiện tại |
| `/automod toggle <on\|off>` | `!automod toggle <on\|off>` | admin | Bật/tắt toàn bộ |
| `/automod rule <name> <on\|off>` | `!automod rule <tên> <on\|off>` | admin | Bật/tắt từng rule |
| `/automod badword <add\|remove\|list> [word]` | `!automod badword ...` | admin | Quản lý từ cấm |
| `/automod ignore ...` | `!automod ignore ...` | admin | Kênh/role bỏ qua |

Rules: `spam, flood, duplicate, link, invite, mention, badword, caps, emoji, massjoin, raid`.

## Cách hoạt động

- `src/services/automodService.js` hook vào `messageCreate` — kiểm tra trước khi routing lệnh.
- Config per-guild qua `guildConfigService` (`automod: { enabled, rules: {...}, action, thresholds }`).
- Vi phạm → `delete message` + hình phạt leo thang theo `action` (warn → timeout → kick → ban), log qua `loggingService`.
- Mass-join / raid detection theo dõi burst join trong cửa sổ thời gian.

## Cách thêm rule mới

1. Thêm tên rule vào `RULES` trong `automod.js` + `automodService.js`.
2. Viết hàm `check<Rule>(message, config)` trả về `{ violated, reason }`.
3. Thêm threshold vào guild config defaults.

## Sửa lỗi thường gặp

| Triệu chứng | Nguyên nhân | Sửa |
|---|---|---|
| Không xóa message | Bot thiếu ManageMessages | Cấp quyền cho role bot |
| False positive link | Rule link bật toàn server | Dùng `/automod ignore` cho kênh share |
