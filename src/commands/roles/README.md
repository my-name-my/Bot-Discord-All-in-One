# Roles — Role Menu

Menu gán role bằng button / select (§6 PROMT).

## Commands

| Slash | Prefix | Quyền bot | Mô tả |
|---|---|---|---|
| `/rolemenu create` | `!rolemenu create` | ManageRoles | Tạo menu (modal nhập role + emoji) |
| `/rolemenu delete <id>` | `!rolemenu delete <id>` | ManageRoles | Xóa menu |
| `/rolemenu list` | `!rolemenu list` | ManageRoles | Liệt kê menu |

Quyền user: admin.

## Cách hoạt động

- Định nghĩa menu lưu trong `roleMenuService` (persist JSON/DB).
- Component handler: `src/interactions/roleMenus.js` — customId `rolemenu:toggle:<menuId>:<roleId>`.
- Toggle role cho user khi click, kiểm tra hierarchy mỗi lần.
- `/role add|remove` (moderation) dùng cho gán thủ công.

## Cách thêm kiểu menu mới

1. Thêm creator trong `roleMenuService.create(type, ...)`.
2. Đăng ký customId mới trong `src/interactions/roleMenus.js`.
