# Interactions (component routes)

Button / select / modal của các feature (§23 PROMT).

| File | CustomId | Feature |
|---|---|---|
| `tickets.js` | `ticket:<action>:...`, modal `modal:ticket:...` | Panel tạo ticket, close/claim/reopen |
| `giveaways.js` | `giveaway:join:<id>` | Nút tham gia |
| `polls.js` | `poll:vote:<id>:<idx>` | Nút vote |
| `roleMenus.js` | `rolemenu:toggle:<menu>:<role>` | Toggle role |
| `registerAll.js` | — | Gọi `register()` của 4 module trên vào `componentHandler` |

## Quy ước (§23)

- Luôn validate permission + tồn tại resource trước khi xử lý; hết hạn (giveaway/poll đóng) → trả ephemeral "đã kết thúc".
- Collector/modal có timeout; mọi nhánh `try/catch` trả lỗi i18n, không để interaction "failed".
- Thêm route mới: tạo `src/interactions/<module>.js` export `register(handler)`, thêm vào mảng `modules` trong `registerAll.js`.
