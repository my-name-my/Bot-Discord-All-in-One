# Config (cấu hình server)

Prefix, ngôn ngữ, bật/tắt module theo từng server (§19 PROMT).

## Commands

| Slash | Prefix | Quyền | Mô tả |
|---|---|---|---|
| `/config prefix [value]` | `!config prefix [!]` | admin | Đổi prefix (1–5 ký tự), không value = xem |
| `/config language [en\|vi]` | `!config language vi` | admin | Ngôn ngữ server |
| `/config module <tên> <on\|off>` | `!config module ...` | admin | Bật/tắt module |
| `/config view` | `!config view` | admin | Xem toàn bộ config |
| `/config reset` | `!config reset` | admin | Reset về mặc định |

## Cách hoạt động

- `guildConfigService` (per-guild document, `ensure(guildId)` khi `guildCreate`).
- `messageCreate` đọc prefix từ config trước khi parse; `commandHandler` gate module (`module` key) trước khi chạy.
- i18n: `ctx.t(key)` resolve theo `guildConfig.language` → `locales/<lang>.json`.
