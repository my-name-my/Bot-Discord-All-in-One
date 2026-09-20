# Levels & XP

XP theo tin nhắn, rank card, leaderboard (§8 PROMT).

## Commands

| Slash | Prefix | Quyền | Mô tả |
|---|---|---|---|
| `/levels rank [user]` | `!rank [user]` | member | Xem level/XP |
| `/levels leaderboard` | `!leaderboard` | member | Top XP server |
| `/levels level` | `!level` | member | Alias xem nhanh |
| `/levels addxp <user> <amount>` | `!levels addxp ...` | admin | Cộng XP tay (quản trị) |

## Cách hoạt động

- `levelService.addXp(guildId, userId, amount)` — messageCreate cộng XP ngẫu nhiên trong khoảng + cooldown chống spam.
- Công thức level: `level = floor(sqrt(xp / 100))` (xem `levelService`).
- Rank card render bằng `@napi-rs/canvas` nếu có, fallback embed text.
- Level-up message gửi vào kênh gốc (có thể tắt per-guild).

## Cách chỉnh

- Đổi rate XP / cooldown / level-up channel trong guild config (`levels: {...}`).
