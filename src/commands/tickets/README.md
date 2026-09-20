# Tickets

Kênh hỗ trợ riêng tư theo yêu cầu (§7 PROMT).

## Commands

| Slash | Prefix | Quyền | Mô tả |
|---|---|---|---|
| `/ticket setup` | `!ticket setup` | mod | Dựng panel tạo ticket (button) |
| `/ticket list` | `!ticket list` | mod | Liệt kê ticket mở |
| `/ticket close` | `!ticket close` | mod | Đóng ticket hiện tại |
| `/ticket reopen` | `!ticket reopen` | mod | Mở lại |
| `/ticket delete` | `!ticket delete` | mod | Xóa kênh ticket |
| `/ticket claim` | `!ticket claim` | mod | Nhận xử lý ticket |

## Cách hoạt động

- `ticketService` tạo channel riêng (`ticket-<user>`), set permission overwrites chỉ user + staff; giới hạn số ticket mở/user (`maxPerUser`).
- Panel là message có button `ticket:create`; các action khác là button trong kênh ticket (`src/interactions/tickets.js`, customId `ticket:<action>:...`).
- **Close** khoá kênh (deny `SendMessages` cho @everyone) + rename `closed-<tên>`; **Reopen** mở khoá + trả lại tên. `claimedBy` chỉ ghi khi staff claim thật.
- **Add/Remove member**: button ➕/➖ trong kênh ticket mở modal nhập user ID (chỉ staff — check quyền **trong kênh**, không phải quyền guild).
- Transcript: fetch 100 tin/call cho tới hết (giới hạn `tickets.transcriptMaxMessages`), lưu khi close/delete (nếu cấu hình).
- Embed/nút/modal i18n 100% theo `language` của guild (§24).

## Quy ước

- Trạng thái ticket lưu trong collection `tickets` (`open/closed`, `claimedBy`, `typeId`).
- Mỗi ticket **type** cấu hình riêng `categoryId` + `staffRoleIds` trong `/config` (guildDefaults `tickets.types`).
- Service là nguồn duy nhất của logic close/reopen/transcript — slash lẫn button gọi cùng hàm (§22, không trùng logic).

## Sửa lỗi thường gặp

| Triệu chứng | Nguyên nhân | Sửa |
|---|---|---|
| `/ticket setup` báo lỗi | Chưa cấu hình ticket types, hoặc bot thiếu ManageChannels | Thêm type + cấp quyền |
| User không thấy kênh | Overwrite sai | Kiểm tra staffRoleIds của type |
| Staff không claim được | Role staff không có overwrite trong kênh | Check overwrites của category |
| Panel không tạo ra | `types` rỗng | Thêm ít nhất 1 ticket type |
