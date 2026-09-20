# Notifications (YouTube / Twitch / RSS)

Báo video / livestream / bài viết mới về kênh Discord (§13 PROMT).

## Commands

| Slash | Prefix | Quyền | Mô tả |
|---|---|---|---|
| `/notify list` | `!notify list` | mod | Liệt kê nguồn đang theo dõi |
| `/notify remove <type> <source>` | `!notify remove ...` | mod | Gỡ nguồn |
| `/notify add <type> <source> <channel> [template] [ping_role]` | `!notify add ...` | mod | Thêm nguồn |

`type`: `youtube | twitch | rss`. Template hỗ trợ `{title} {link}`.

## Cách hoạt động

- `notificationService` poll định kỳ (`setClient` + poller trong `ready`), so sánh id mới nhất đã thấy.
- YouTube: check RSS feed của channel; Twitch: cần `TWITCH_CLIENT_ID/SECRET`; RSS: fetch feed bất kỳ.
- Có bài mới → gửi embed vào kênh + ping role (nếu đặt).

## Sửa lỗi thường gặp

| Triệu chứng | Nguyên nhân | Sửa |
|---|---|---|
| Twitch không báo | Thiếu client id/secret | Điền `.env` TWITCH_* |
| Báo trùng | Poller restart | Kiểm tra persist `lastSeen` trong DB |
