# Economy

Tiền ảo, daily/work, ngân hàng, shop, chuyển tiền (§9 PROMT).

## Commands

| Slash subcommand | Prefix | Mô tả |
|---|---|---|
| `/economy balance [user]` | `!economy balance` | Số dư ví + ngân hàng |
| `/economy daily` | `!economy daily` | Nhận thưởng hằng ngày (cooldown 24h) |
| `/economy work` | `!economy work` | Làm việc nhận tiền (cooldown ngắn) |
| `/economy deposit <n>` | `!economy deposit <n>` | Gửi vào ngân hàng |
| `/economy withdraw <n>` | `!economy withdraw <n>` | Rút tiền |
| `/economy pay <user> <n>` | `!economy pay @u <n>` | Chuyển tiền |
| `/economy shop` | `!economy shop` | Xem cửa hàng |
| `/economy inventory` | `!economy inventory` | Túi đồ |
| `/economy admin ...` | — | Chỉnh số dư / shop (admin) |

## Cách hoạt động

- `economyService` lưu `wallet` + `bank` + `inventory` per `(guildId, userId)`.
- Daily/work dùng `cooldownService` chống spam; số tiền cấu hình được.
- Shop item định nghĩa trong guild config hoặc DB; mua → trừ wallet, cộng inventory.
- Games (`coinflip`, `slots`…) trừ/cộng wallet qua cùng service — không duplicate logic.

## Cách thêm item shop

1. `/economy admin shop-add <name> <price> [role]` hoặc sửa guild config.
2. Item loại `role` tự gán role khi mua (kiểm tra hierarchy).
