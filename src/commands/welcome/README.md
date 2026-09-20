# Welcome / Goodbye

Chào member mới + tạm biệt member rời đi, hỗ trợ placeholder và auto-role (§5 PROMT).

## Commands

| Slash | Prefix | Quyền | Mô tả |
|---|---|---|---|
| `/welcome channel #kênh` | `!welcome channel #kênh` | admin | Đặt kênh chào (bỏ trống → xóa) |
| `/welcome message <text>` | `!welcome message ...` | admin | Nội dung (hỗ trợ placeholder, tối đa 2000 ký tự) |
| `/welcome autorole <role>` | `!welcome autorole @role` | admin | Role tự gán (bỏ trống → tắt; từ chối role cao hơn bot) |
| `/welcome embed <on\|off>` | `!welcome embed ...` | admin | Dùng embed hay text |
| `/welcome toggle <on\|off>` | `!welcome toggle ...` | admin | Bật/tắt |
| `/welcome test` | `!welcome test` | admin | Gửi thử (ephemeral) |
| `/goodbye channel/message/embed/toggle/test` | `!goodbye ...` | admin | Tương tự cho rời đi |

Placeholder: `{user} {username} {server} {memberCount} {mention}`.

## Cách hoạt động

- Event `guildMemberAdd` → AutoMod đánh giá raid trước, sau đó `welcomeService.sendWelcome` chạy. Event `guildMemberRemove` → `sendGoodbye`.
- **Auto-role độc lập với welcome message** (spec §5 "Auto role"): tắt message hay chưa đặt kênh thì role vẫn được gán. Từng role fail-soft — role đã xóa/không `editable` (cao hơn role bot, managed) bị skip và ghi log `logging.events.autoroleSkipped` vào kênh log members.
- **Log join/leave độc lập với message** (spec §4): `memberJoin`/`memberLeave` luôn được ghi, kể cả khi tắt message hay chưa đặt kênh.
- `goodbye.channelId` trống → **fallback sang `welcome.channelId`** nên server một kênh chung không cần cấu hình 2 lần.
- Event path **không bao giờ throw**: thiếu quyền gửi/kênh đã xóa chỉ bỏ qua. Check `canSendIn` trước (SendMessages + ViewChannel + SendMessagesInThreads cho thread) để không spam lỗi.
- Embed title dịch theo **ngôn ngữ của guild** (`welcome.welcomeTitle` / `welcome.goodbyeTitle`); goodbye dùng `allowedMentions: { parse: [] }` để không ping người đã rời.
- `member.partial` (leave không cache user): placeholder user/username render rỗng, không crash.

## Thêm / sửa

- Sửa nội dung/logic event: `src/services/welcomeService.js` (`sendWelcome`, `sendGoodbye`, `assignAutoRoles`, `buildWelcomePayload`, `buildGoodbyePayload`).
- Sửa lệnh cấu hình: `src/commands/welcome/welcome.js` + `goodbye.js` (mỗi hàm một subcommand, validate rồi `guildConfigService.update`).
- Sửa placeholder: `src/utils/placeholders.js`. Sửa mặc định: `src/models/guildDefaults.js` (`welcome.*`, `goodbye.*`).
- Test hồi quy: `npm run test:welcome` (37 case: placeholder, i18n vi/en, autorole fail-soft, 4 nhánh welcome, 5 nhánh goodbye).

## Sửa lỗi thường gặp

| Triệu chứng | Nguyên nhân | Sửa |
|---|---|---|
| Không gửi chào | Chưa đặt kênh / toggle off | `/welcome channel` + `/welcome toggle on` |
| Không gán role | Role bot thấp hơn role cần gán | Kéo role bot lên trên (lúc cấu hình `/welcome autorole` đã báo ngay) |
| Không thấy log join/leave | Chưa đặt kênh log members | `/log setup` hoặc `/log channel` |
| Kênh cấu hình rồi vẫn im lặng | Bot thiếu SendMessages/EmbedLinks ở kênh đó | Cấp quyền cho bot ở kênh |
