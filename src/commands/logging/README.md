# Logging

Ghi log sự kiện server ra kênh chỉ định bằng Embed (§4 PROMT).

## Commands

| Slash | Prefix | Quyền | Mô tả |
|---|---|---|---|
| `/log setup #kênh` | `!log setup #kênh` | admin | Đặt kênh log mặc định |
| `/log channel <loại> #kênh` | `!log channel ...` | admin | Đặt kênh theo loại sự kiện |
| `/log category <loại> <on\|off>` | `!log category ...` | admin | Bật/tắt từng loại |
| `/log toggle <on\|off>` | `!log toggle ...` | admin | Bật/tắt toàn bộ |
| `/log list` | `!log list` | admin | Xem cấu hình |

Sự kiện: join/leave, ban/unban/kick/timeout/warn, message delete/edit, role/channel/nick/voice.

## Cách hoạt động

- `src/services/loggingService.js` giữ client ref (`setClient`), các service khác gọi `log(guildId, type, embed)`.
- Event listeners (`messageDelete`, `guildMemberAdd`…) forward về kênh đã cấu hình trong guild config.
- `reportCommandError(ctx, error)` gửi lỗi command về kênh error-log nếu có.

## Cách thêm loại log mới

1. Thêm event listener trong `src/events/` hoặc hook trong service.
2. Gọi `loggingService.log(guildId, '<loại>', embed)`.
3. Thêm toggle vào subcommand `category` + guild config defaults.
