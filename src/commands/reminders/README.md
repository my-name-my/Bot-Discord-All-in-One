# Reminders

Nhắc việc cá nhân (§12 PROMT).

## Commands

| Slash | Prefix | Mô tả |
|---|---|---|
| `/remind set <duration> <text>` | `!remind <dur> <text>` | Đặt nhắc (vd `10m uống nước`) |
| `/remind list` | `!remind list` | Liệt kê nhắc của bạn |
| `/remind remove <number>` | `!remind remove <n>` | Xóa nhắc |

## Cách hoạt động

- `reminderService.schedule(guildId, channelId, userId, text, durationMs)` — timer + persist; `restore(client)` khi boot.
- Hết giờ → gửi vào kênh gốc (fallback DM nếu không gửi được).
- Duration parse qua `utils/time.parseDuration` (`10s 5m 2h 7d`).
