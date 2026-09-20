# Discord Bot — Full Feature Specification

## 1. Tổng quan

Xây dựng một Discord Bot đa chức năng, có kiến trúc module rõ ràng, dễ mở rộng và dễ bảo trì.

Bot hỗ trợ đồng thời:

* **Slash Commands** (`/command`)
* **Prefix Commands** (`!command`, prefix có thể cấu hình)
* Button
* Select Menu
* Modal
* Context Menu
* Event Handler
* Database
* Permission System
* Logging
* Configuration theo từng Discord Server

Bot phải được thiết kế để chạy ổn định trên nhiều server.

---

# 2. Quản lý Server

## Moderation

Implement các chức năng:

* Ban member
* Unban member
* Kick member
* Timeout member
* Remove timeout
* Warn member
* Xem lịch sử warn
* Xóa warn
* Xóa nhiều tin nhắn
* Lock channel
* Unlock channel
* Slowmode
* Nickname management
* Role management

Commands đề xuất:

```text
/ban
/unban
/kick
/timeout
/warn
/warnings
/unwarn
/purge
/lock
/unlock
/slowmode
```

Prefix tương ứng:

```text
!ban
!unban
!kick
!timeout
!warn
!warnings
!unwarn
!purge
!lock
!unlock
!slowmode
```

---

# 3. Auto Moderation

Bot phải có hệ thống AutoMod.

Các tính năng:

* Anti spam
* Anti flood
* Anti duplicate message
* Anti link
* Anti invite
* Anti mention spam
* Bad word filter
* Caps lock filter
* Emoji spam protection
* Mass join detection
* Raid protection

Cho phép cấu hình riêng từng server.

Ví dụ:

```text
Anti Spam: ON
Anti Link: OFF
Anti Invite: ON
Bad Word Filter: ON
Max Messages: 5
Time Window: 5 seconds
```

Khi vi phạm:

* Delete message
* Warn
* Timeout
* Kick
* Ban

Mức xử phạt phải configurable.

---

# 4. Logging

Tạo hệ thống log đầy đủ.

Theo dõi:

* Member join
* Member leave
* Ban
* Unban
* Kick
* Timeout
* Warn
* Message delete
* Message edit
* Role create
* Role delete
* Role update
* Channel create
* Channel delete
* Channel update
* Nickname change
* Voice join
* Voice leave
* Voice move

Cho phép chọn channel log:

```text
/log setup
```

Hoặc:

```text
/log channel #logs
```

Log sử dụng Discord Embed.

---

# 5. Welcome / Goodbye

Hệ thống chào thành viên mới.

Tính năng:

* Welcome message
* Goodbye message
* Welcome embed
* Goodbye embed
* Auto role
* Welcome channel
* Custom message
* Placeholder

Placeholder:

```text
{user}
{username}
{server}
{memberCount}
{mention}
```

Ví dụ:

```text
Chào mừng {user} đến với {server}!
Bạn là thành viên thứ {memberCount}.
```

---

# 6. Role System

Quản lý role.

Tính năng:

* Auto Role
* Add Role
* Remove Role
* Role menu
* Reaction role
* Button role
* Select menu role
* Temporary role
* Level role

Commands:

```text
/role add
/role remove
/role create
/role delete
/autorole
/rolemenu
```

Bot phải kiểm tra hierarchy của Discord Role trước khi thực hiện.

---

# 7. Ticket System

Hệ thống Ticket hoàn chỉnh.

Tính năng:

* Tạo ticket bằng Button
* Ticket category
* Ticket channel
* Claim ticket
* Close ticket
* Reopen ticket
* Delete ticket
* Add member
* Remove member
* Transcript
* Ticket log

Ví dụ:

```text
🎫 Create Ticket
```

Sau khi click:

```text
Support
Report
Purchase
Other
```

Mỗi loại ticket có thể cấu hình category và staff role riêng.

---

# 8. Level / XP System

Hệ thống XP cho member.

Tính năng:

* XP khi gửi message
* Level up
* XP cooldown
* XP multiplier
* Level role reward
* Leaderboard
* Rank
* User level

Commands:

```text
/level
/rank
/leaderboard
/levels
```

Không được cho XP khi spam message.

Có cooldown configurable.

---

# 9. Economy System

Hệ thống tiền ảo.

Mỗi member có:

```text
balance
bank
inventory
```

Commands:

```text
/balance
/daily
/work
/give
/deposit
/withdraw
/pay
/leaderboard
```

Tính năng:

* Daily reward
* Work
* Transfer money
* Bank
* Shop
* Inventory
* Item
* Purchase
* Sell
* Economy leaderboard

Admin có thể:

```text
/economy add
/economy remove
/economy set
```

---

# 10. Giveaway

Hệ thống Giveaway.

Tính năng:

* Create giveaway
* Join giveaway
* End giveaway
* Reroll winner
* Multiple winners
* Duration
* Required role
* Minimum account age
* Required server level

Ví dụ:

```text
/giveaway create
/giveaway end
/giveaway reroll
```

Giveaway sử dụng Button hoặc Reaction.

---

# 11. Games / Minigames

Các minigame đơn giản:

* Coin Flip
* Rock Paper Scissors
* Dice
* Guess Number
* Quiz
* Blackjack
* Slots

Có thể tích hợp với Economy.

Ví dụ:

```text
/coinflip
/rps
/dice
/guess
/quiz
/blackjack
/slots
```

Phải có:

* Cooldown
* Anti abuse
* Bet limit
* Economy validation

---

# 12. Utility

Các command tiện ích:

```text
/help
/ping
/avatar
/banner
/userinfo
/serverinfo
/membercount
/roleinfo
/channelinfo
/emoji
/poll
/remind
/uptime
/botinfo
```

Hỗ trợ:

* Embed
* Button
* Select Menu
* Modal

---

# 13. Poll System

Tạo poll.

Ví dụ:

```text
/poll create
```

Hỗ trợ:

* Question
* Multiple options
* Duration
* Anonymous vote
* Multiple choice
* Auto close

Khi kết thúc phải hiển thị kết quả.

---

# 14. Reminder System

Hệ thống nhắc nhở.

Ví dụ:

```text
/remind 30m uống nước
/remind 2h kiểm tra server
/remind 1d meeting
```

Hỗ trợ:

```text
10s
5m
2h
3d
```

Reminder phải được lưu Database để không mất khi bot restart.

---

# 15. Notification System

Hỗ trợ thông báo từ các nguồn bên ngoài khi API phù hợp.

Ví dụ:

* YouTube
* Twitch
* RSS
* Website
* Webhook

Có thể cấu hình:

```text
Notification source
Target channel
Message template
Embed
Mention role
```

---

# 16. Server Configuration

Mỗi server phải có configuration riêng.

Ví dụ:

```json
{
  "prefix": "!",
  "language": "vi",
  "welcome": true,
  "automod": true,
  "logging": true,
  "economy": true,
  "level": true
}
```

Không được sử dụng configuration global cho những thiết lập thuộc từng server.

---

# 17. Permission System

Mọi command phải kiểm tra quyền.

Hỗ trợ:

* Discord Permission
* Administrator
* Manage Guild
* Manage Messages
* Manage Roles
* Ban Members
* Kick Members
* Custom Staff Role
* Owner only

Ví dụ:

```text
/admin
/mod
/staff
/member
```

Không cho member thường sử dụng command quản trị.

---

# 18. Cooldown System

Các command cần cooldown.

Ví dụ:

```text
/daily      → 24h
/work       → 10m
/slots      → 5s
/coinflip   → 3s
```

Cooldown nên hỗ trợ:

* User cooldown
* Guild cooldown
* Command cooldown

---

# 19. Database

Bot phải sử dụng Database thay vì lưu dữ liệu quan trọng trực tiếp trong file JSON.

Có thể hỗ trợ:

* MySQL
* PostgreSQL
* SQLite
* Mongo

Dữ liệu cần lưu:

```text
Guild
User
Warning
XP
Level
Economy
Inventory
Ticket
Giveaway
Reminder
AutoMod Config
Welcome Config
Logging Config
Role Config
```

Database layer phải tách riêng khỏi command layer.
Lưu ý: nếu bot chưa config database thì chuyển sang dùng `json` trong hệ thống.

---

# 20. Error Handling

Bot phải xử lý lỗi tập trung.

Khi command lỗi:

* Không crash bot
* Gửi thông báo thân thiện cho user
* Log lỗi vào console
* Có thể gửi error log vào Discord staff channel

Ví dụ:

```text
❌ Đã xảy ra lỗi khi thực hiện command.
Vui lòng thử lại sau.
```

Không gửi:

```text
Database password
Bot token
API key
Stack trace
```

cho user.

---

# 21. Security

Bắt buộc:

* Token sử dụng `.env`
* Không hard-code token
* Validate input
* Rate limit
* Cooldown
* Permission check
* SQL injection protection
* Không eval code từ user
* Không execute arbitrary code
* Kiểm tra Discord role hierarchy
* Kiểm tra bot permissions

`.env` mẫu:

```env
DISCORD_TOKEN=
CLIENT_ID=
DATABASE_URL=
PREFIX=!
```

---

# 22. Prefix + Slash Command

Bot phải hỗ trợ **cả hai loại command**.

Ví dụ Slash:

```text
/ban @user
```

Prefix:

```text
!ban @user
```

Logic xử lý command phải được dùng chung.

Không viết hai hệ thống logic riêng biệt nếu không cần thiết.

Kiến trúc nên giống:

```text
Command Input
     ↓
Command Parser
     ↓
Command Handler
     ↓
Permission Check
     ↓
Cooldown Check
     ↓
Business Logic
     ↓
Response
```

---

# 23. UI Discord

Ưu tiên sử dụng:

* Embed
* Button
* Select Menu
* Modal
* Context Menu

Không spam message text nếu có thể sử dụng Interaction UI.

Các interaction phải có:

* Error handling
* Timeout handling
* Permission validation

---

# 24. Ngôn ngữ

Mặc định:

```text
Tiếng Việt
```

Có thể thiết kế hệ thống i18n để hỗ trợ:

```text
vi
en
```

Không hard-code toàn bộ text trực tiếp trong command nếu có thể đưa vào language file.

Ví dụ:

```text
/locales/vi.json
/locales/en.json
```

---

# 25. Cấu trúc project đề xuất

```text
discord-bot/
│
├── src/
│   ├── commands/
│   │   ├── moderation/
│   │   ├── automod/
│   │   ├── economy/
│   │   ├── levels/
│   │   ├── ticket/
│   │   ├── giveaway/
│   │   ├── games/
│   │   └── utility/
│   │
│   ├── events/
│   │
│   ├── handlers/
│   │
│   ├── services/
│   │
│   ├── database/
│   │
│   ├── models/
│   │
│   ├── utils/
│   │
│   ├── config/
│   │
│   └── index.js
│
├── locales/
│   ├── vi.json
│   └── en.json
│
├── migrations/
│
├── .env
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

# 26. Nguyên tắc phát triển

AI coding agent phải:

1. Không tạo code tất cả trong một file.
2. Chia module rõ ràng.
3. Tái sử dụng service.
4. Không duplicate business logic giữa Prefix và Slash.
5. Kiểm tra permission trước khi thực hiện hành động.
6. Kiểm tra bot permission.
7. Xử lý lỗi đầy đủ.
8. Sử dụng async/await.
9. Không hard-code secret.
10. Database query phải parameterized.
11. Code phải dễ mở rộng.
12. Không xóa tính năng hiện có khi thêm tính năng mới.
13. Không thay đổi API/config hiện tại nếu không cần thiết.
14. Mỗi module phải độc lập nhất có thể.
15. Khi sửa lỗi phải xác định nguyên nhân trước khi sửa.
16. Ghi README.md ở mỗi modules: cách hoạt động, cách thêm , cách sửa,...
17. Ghi 1 file .md để ghi lại những gì thay đổi

---

# 28. Quy trình triển khai

AI coding agent nên triển khai theo thứ tự:

```text
1. Core Bot
2. Command Handler
3. Event Handler
4. Database
5. Permission System
6. Moderation
7. AutoMod
8. Logging
9. Welcome
10. Role System
11. Ticket
12. Level / XP
13. Economy
14. Giveaway
15. Games
16. Utility
17. Notification
18. Dashboard
19. Testing
20. Optimization
```

Không triển khai tất cả cùng lúc.

Sau mỗi module phải:

* Kiểm tra syntax
* Test command
* Test permission
* Test error handling
* Test bot restart
* Kiểm tra database
* Kiểm tra interaction

---

# 29. Mục tiêu cuối cùng

Bot phải trở thành một **Discord Bot All-in-One**, hỗ trợ:

```text
Moderation
AutoMod
Logging
Welcome
Roles
Tickets
Level
Economy
Giveaway
Games
Utility
Notifications
Database
```

và hoạt động với cả:

```text
Prefix Commands
+
Slash Commands
```

Ưu tiên:

```text
Ổn định
Bảo mật
Dễ mở rộng
Dễ bảo trì
Không duplicate code
Không crash khi command lỗi
```
