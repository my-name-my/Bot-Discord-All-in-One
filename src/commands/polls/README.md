# Polls (nâng cao)

Poll nhiều lựa chọn, ẩn danh, button vote + tự đóng (§12 PROMT).

## Commands

| Slash | Prefix | Quyền | Mô tả |
|---|---|---|---|
| `/poll create <question> <options;...> [duration] [anonymous] [multi]` | `!poll create ...` | member | Tạo poll |

Options cách nhau bằng `;` (tối đa ~10).

## Cách hoạt động

- `pollService.create({ guild, channel, hostId, ... })` gửi embed + 1 button / 1 option (`src/interactions/polls.js`, customId `poll:vote:<id>:<idx>`).
- `multi=false` → mỗi user 1 vote (đổi vote ghi đè); `anonymous=true` → kết quả chỉ hiện khi đóng.
- Timer tự đóng theo duration + `restore(client)` khi boot.
