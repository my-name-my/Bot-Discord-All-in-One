# Welcome / Goodbye

Chào member mới + tạm biệt member rời đi, hỗ trợ placeholder và auto-role (§5 PROMT).

## Commands

| Slash | Prefix | Quyền | Mô tả |
|---|---|---|---|
| `/welcome channel #kênh` | `!welcome channel #kênh` | admin | Đặt kênh chào |
| `/welcome message <text>` | `!welcome message ...` | admin | Nội dung (hỗ trợ placeholder) |
| `/welcome autorole <role>` | `!welcome autorole @role` | admin | Role tự gán |
| `/welcome embed <on\|off>` | `!welcome embed ...` | admin | Dùng embed hay text |
| `/welcome toggle <on\|off>` | `!welcome toggle ...` | admin | Bật/tắt |
| `/welcome test` | `!welcome test` | admin | Gửi thử |
| `/goodbye channel/message/toggle` | `!goodbye ...` | admin | Tương tự cho rời đi |

Placeholder: `{user} {username} {server} {memberCount} {mention}`.

## Cách hoạt động

- `welcomeService` lắng nghe `guildMemberAdd` / `guildMemberRemove`, render template từ guild config rồi gửi vào kênh đã đặt.
- Auto-role gán sau khi join (kiểm tra hierarchy + quyền ManageRoles).

## Sửa lỗi thường gặp

| Triệu chứng | Nguyên nhân | Sửa |
|---|---|---|
| Không gửi chào | Chưa đặt kênh / toggle off | `/welcome channel` + `/welcome toggle on` |
| Không gán role | Role bot thấp hơn role cần gán | Kéo role bot lên trên |
