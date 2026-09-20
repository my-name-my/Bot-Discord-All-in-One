# Games

Minigame giải trí, tích hợp economy (§11 PROMT).

## Commands (`/games <sub>`)

| Subcommand | Prefix | Mô tả |
|---|---|---|
| `coinflip [bet]` | `!games coinflip [tiền]` | Tung đồng xu |
| `dice [bet] [guess]` | `!games dice ...` | Xúc xắc |
| `rps [bet] <kéo\|búa\|bao>` | `!games rps ...` | Kéo-búa-bao |
| `guess` | `!games guess` | Đoán số |
| `quiz` | `!games quiz` | Đố vui (button trả lời) |
| `blackjack [bet]` | `!games blackjack ...` | Xì dách rút gọn |
| `slots [bet]` | `!games slots ...` | Máy xèng |

## Cách hoạt động

- Logic game thuần trong `games.js`; tiền cược trừ/cộng qua `economyService` — hết tiền thì từ chối bet.
- Quiz dùng button collector có timeout (§23 PROMT: error + timeout handling).
- Cooldown 3s/user chống spam.

## Cách thêm game mới

1. Thêm subcommand vào `SUBCOMMANDS` + `subcommands` slash options.
2. Viết `cmd<Tên>(ctx)` và map trong `run(ctx)` dispatcher.
