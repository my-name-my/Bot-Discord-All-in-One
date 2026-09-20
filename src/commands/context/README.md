# Context Menu — Profile

Chuột phải vào user → Apps → Profile (§21–23 PROMT).

## Command

| Tên | Loại | Quyền | Mô tả |
|---|---|---|---|
| `Profile` | User context menu | member | Card level + số dư economy của user được chọn |

Đăng ký kèm trong slash body qua field `contextMenu: { type: 'user', name: 'Profile' }` (`slashBuilder` tách thành entry riêng type 2).

## Cách hoạt động

- `run(ctx)` đọc `ctx.options.target` (user được click) thay vì `ctx.user`.
- Embed gộp `levelService.getRank` + `economyService.getBalance`.
- Thêm context menu mới: tạo file trong `src/commands/context/`, export thêm `contextMenu: { type: 'user'|'message', name }`.
