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

- `ticketService` tạo channel riêng (`ticket-<user>`), set permission overwrites chỉ user + staff.
- Panel là message có button `ticket:create`; các action khác là button trong kênh ticket (`src/interactions/tickets.js`, customId `ticket:<action>:...`).
- Transcript: lưu lịch sử message khi close (nếu cấu hình).

## Sửa lỗi thường gặp

| Triệu chứng | Nguyên nhân | Sửa |
|---|---|---|
| Không tạo được kênh | Bot thiếu ManageChannels | Cấp quyền |
| User không thấy kênh | Overwrite sai | Kiểm tra `/ticket setup` role staff |
