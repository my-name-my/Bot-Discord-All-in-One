# Giveaways

Tạo và quay số giveaway bằng button tham gia (§10 PROMT).

## Commands

| Slash | Prefix | Quyền | Mô tả |
|---|---|---|---|
| `/giveaway create <duration> <prize> [winners] [required_role] [min_account_age]` | `!giveaway create ...` | mod | Tạo giveaway |
| `/giveaway end <message_id>` | `!giveaway end <id>` | mod | Kết thúc sớm |
| `/giveaway reroll <message_id>` | `!giveaway reroll <id>` | mod | Quay lại |
| `/giveaway list` | `!giveaway list` | mod | Giveaway đang chạy |

## Cách hoạt động

- `giveawayService.create({ guild, channel, ... })` gửi embed + button `giveaway:join:<id>` (`src/interactions/giveaways.js`).
- Timer `setTimeout` theo `endsAt`; `restore(client)` khi boot để không mất giveaway khi restart.
- Điều kiện tham gia: role bắt buộc, tuổi tài khoản tối thiểu; chống join 2 lần (Set per giveaway, persist DB).
- Kết thúc → random winners, ping + gửi kết quả, lưu lịch sử.

## Sửa lỗi thường gặp

| Triệu chứng | Nguyên nhân | Sửa |
|---|---|---|
| Restart mất giveaway | `restore()` chưa chạy | Kiểm tra log `[ready] Timer restore` |
| Không ai join được | required_role sai | Kiểm tra id role |
