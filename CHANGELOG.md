# Changelog

Mọi thay đổi ảnh hưởng hành vi bot đều ghi ở đây (§26.17 PROMT).
Định dạng: `## [ngày] — Tiêu đề`, mỗi mục ghi rõ **nguyên nhân gốc → cách sửa → cách kiểm chứng**.

## [2026-09-21] — Xoá module Polls, Reminders, Games, Notifications

### Đã xoá

- **Commands**: `src/commands/polls/`, `src/commands/reminders/`, `src/commands/notifications/`, `src/commands/games/` (4 thư mục) + sub `poll`/`remind` khỏi `src/commands/utility/` (còn 12 sub).
- **Services**: `pollService.js`, `reminderService.js`, `notificationService.js`, `gameService.js`.
- **Interactions**: `src/interactions/polls.js` + đăng ký trong `registerAll.js`.
- **Wiring**: `index.js` (require/services/setClient), `events/ready.js` (restore), `config.js` MODULE_KEYS (`games`/`notifications`), `guildDefaults.modules` (`games`/`notifications`).
- **Constants**: `poll*`, `guess*`, `quizTimeoutMs`, `gameSessionTtlMs`, `GAME_PAYOUTS` (giữ `betMin/betMax` vì economy vẫn dùng).
- **Locales vi/en**: block `poll`, `reminders`, `notify`, `games`, `gamesComingSoon`.
- **Scripts**: `test-games.js`, `patch-games-locale.js` + script npm `test:games`; dọn `smoke-test.js`.
- **Migrations**: bảng `polls`/`reminders`/`notifications` khỏi 3 file init SQL.
- **Docs**: README.md (bảng module), `Project Structure.md` (sections 11/13/14/15 + mục lục + cây thư mục), các README services/database/interactions/utility/logging, comment rác trong `tempRoleService`/`messageDelete`/`time.js`.

### Kiểm chứng

- `npm run check` → 114 files, 0 lỗi; `npm test` (smoke) → 30 commands, 21 events, **PASSED**.
- Các suite còn lại vẫn xanh: levels 28, economy 36, welcome 37, giveaways 100; `check-ticket-locale` & `check-giveaway-locale` → 0 missing/0 unused.

## [2026-09-21] — Games: slash crash, 3 game "comingSoon" chết, cược không nguyên tử, i18n

### Nguyên nhân gốc

- **`/games guess` (slash) crash**: `ctx.reply({ fetchReply: true })` với slash trả `InteractionResponse` (không có `.channel`) → `msg.channel.createMessageCollector` ném TypeError.
- **`quiz`/`blackjack`/`slots`** trả `games.comingSoon` — key **không tồn tại** ở cả vi/en → người dùng thấy raw key; trong khi README + ~50 key locale (`quizTitle`, `bj*`, `slots*`…) chứng tỏ 3 game này phải chạy được.
- **Cược không nguyên tử**: `payout(bet, won)` gọi `addWallet`/`removeWallet` rời rạc rồi **bỏ qua kết quả trả về** → thua vẫn báo "-bet" dù chưa trừ được tiền (lách luật), và tự bịa số tiền hiển thị thay vì dùng `net` thật từ DB.
- `/games rps` **thiếu option `bet`** trong slash definition → không bao giờ cược được dù README ghi có; hệ số rơi vào hard-code rời rạc.
- `dice`: `guess` không validate (nhập 99 → chắc chắn thua) và **ăn mặc định khi ra 6** dù không đoán gì; `coinflip` tung đồng xu theo kết quả hiển thị và kết quả thắng thua tách rời.
- Toàn bộ nhãn hard-code tiếng Anh ("Guess", "Enter a number!", "You won!") — ~50 key `games.*` có sẵn trong locale không dùng; 3 key vi mất dấu (`needBet`/`invalidBet`/`notEnough`); `games.rps` (tiêu đề) thiếu ở cả vi/en.

### Sửa

- **`src/services/gameService.js` (mới)**: luật chơi thuần tách khỏi command — coinflip/dice/rps/slots/blackjack (deck 52, dealer đứng 17, natural 2.4x) + ngân hàng quiz 8 câu (`games.qbank` locale, đáp án xáo thứ tự có map lại `correctIndex`), RNG injectable để test tất định, Fisher-Yates thay sort-random có bias; session store TTL + renderer (`gameEmbed`/`betLine`/`gameButton`).
- **`src/services/economyService.js`**: thêm **`settleBet(guildId, userId, stake, prize)`** — trừ cược + cộng thưởng **trong 1 khoá account**, trả `{ ok, wallet, net }`; hết tiền → `{ ok: false }` (không còn khe mất tiền).
- **`src/commands/games/games.js`**: viết lại `cmdGuess` (dùng `ctx.channel` — hết crash slash; giới hạn `LIMITS.guessMaxTries`/timeout từ constants; hint qua i18n `guessHigher/guessLower/guessWin/guessOver/guessTimeout`; input ngoài 1-100 bỏ qua không tính lượt); **`cmdQuiz`** (4 nút đáp án, settle nguyên tử lúc trả lời, timeout hiện đáp án); **`cmdBlackjack`** (hit/stand qua nút, bust/stand/natural, hiện đủ tay dealer khi kết thúc, hết giờ bỏ ván không mất tiền); **`cmdSlots`** (settle qua `settleBet`, EV 0.64 — nhà cái lời 36%); `rps` thêm option `bet`; xoá `playWagered`/`normalizeRpsChoice` trùng lặp, mọi số tiền hiển thị lấy từ `net` DB.
- **`src/config/constants.js`**: thêm `GAME_PAYOUTS` (hệ số từng game + chú thích EV), `guessMaxTries: 7`, `guessTimeoutMs`, `quizTimeoutMs: 20s`, `gameSessionTtlMs: 3 phút`.
- **Locales vi/en**: bổ sung/sửa `games.*` (57 key: `rps`, `diceRolled`, `guessHint`…, 3 key vi mất dấu đã sửa dấu), qbank 8 câu đồng bộ thứ tự đáp án vi/en; `scripts/patch-games-locale.js` (idempotent).
- **`scripts/test-games.js`** (`npm run test:games`): 50 test — luật từng game với RNG tất định, `settleBet` (win/lose/push/insufficient/invalid), hợp đồng command (7 subcommand, blackjack/slots yêu cầu bet, rps có bet, không còn `comingSoon`/`fetchReply`), đủ 55 key vi/en + placeholder parity + qbank vi/en cùng vị trí đáp án.

### Kiểm chứng

- `npm run test:games` → **50/50 pass**; `npm run check` → 0 lỗi cú pháp; các suite cũ vẫn xanh (levels 28, economy 36, welcome 37, giveaways 100).

## [2026-09-21] — Giveaways: lỗi create luôn crash, thiếu kiểm tra điều kiện, race condition, i18n

### Nguyên nhân gốc

- **`giveawayService.create()`** gọi `i18n.translate(lang, 'giveaway.button')` khi `lang` **chưa hề được khai báo** trong hàm → `ReferenceError: lang is not defined` ⇒ **`/giveaway create` luôn lỗi**, không tạo được giveaway nào.
- `buildEmbed` hard-code tiếng Việt (`Số người thắng`, `Kết thúc`, `Người tham gia`…) → guild đặt `language: en` vẫn nhận embed tiếng Việt (vi phạm §24).
- **`toggleJoin` bỏ qua hoàn toàn điều kiện tham gia** → người thiếu role hoặc tài khoản quá mới vẫn join được; danh sách participant nhiễm entry không hợp lệ.
- `reroll` chỉ loại người thắng cũ, **không lọc lại điều kiện** → có thể chọn người đã bị gỡ role/rời server.
- **Race condition**: `toggleJoin`/`end`/`reroll` là read-modify-write không khoá → click đúp sinh entry trùng, nhiều người join đồng thời ghi đè lẫn nhau (lost update).
- **`cmdList`** truyền thẳng **array** vào `embed.setDescription(...)` → discord.js nối bằng dấu phẩy, cả danh sách dồn thành 1 dòng; `noActive` (rỗng) báo bằng `sendError` dù là trạng thái bình thường.
- `cmdCreate` truyền `{min,max}` vào key **không có placeholder** (`giveaway.invalidDuration`) nên params bị bỏ; `winners`/`minAccountAge` từ prefix là chuỗi → `Number('5abc')=NaN` lọt qua kiểm tra; key `durationInvalid`/`winnersInvalid`/`endedEarly`/`noParticipants`/`listTitle` có trong locale nhưng không dùng.
- **`en.json`: `rerolled = "New winner: {user"`** — placeholder hỏng, render ra literal; `rerollFailed` **thiếu ở cả vi/en** (handler đọc key này khi quay lại thất bại).
- `end()` có param `force` chết, **dựng 2 embed khác nhau** cho tin công bố và tin gốc, log cứng `Prize:/Winners:`; nhánh rời giveaway không vẽ lại embed; `interactions/giveaways.js` trả promise trần ở nhánh `followUp` (unhandled rejection khi interaction hết hạn) và chỉ nhận diện `'joined'/'left'`.

### Sửa

- **`services/giveawayService.js`**: `create()` resolve ngôn ngữ trước khi build UI qua `guildOptions()` (language + `giveaways.pingRoleId` từ config) — **fix crash**; `buildEmbed` i18n hoá toàn bộ; thêm `withGiveawayLock()` (mutex theo `guild:message`) bọc `toggleJoin`/`end`/`reroll`; tách `eligibility()` + `eligibleParticipants()` dùng chung cho join và quay số; `reroll` chỉ quay trong pool còn đủ điều kiện; `end()` dùng **một** `buildEndedEmbed` cho cả 2 tin, ghi `endedAt`, log qua `titleKey`/`logWinners`; `refreshEmbed()` gọi cho cả join **và** leave; clamp `winners`/`minAccountAgeDays`; prize chuẩn hoá khoảng trắng.
- **`commands/giveaways/giveaways.js`**: validate chặt (`invalidDuration` khi parse lỗi → `durationInvalid` khi ngoài khoảng, `winnersInvalid`, `ageInvalid` kể cả NaN, `needPrize`); `cmdList` join từng dòng qua `giveaway.listLine` + tiêu đề i18n, rỗng → `sendInfo('giveaway.noActive')`; `cmdEnd` phân biệt `endedEarly`/`noParticipants`; truyền `lang: ctx.language` xuống service.
- **`interactions/giveaways.js`**: map trạng thái → key i18n (`notEligibleRole/notEligibleAge/memberLeft/alreadyEnded/notFound`), `safeReply` catch cả nhánh `followUp`.
- **`locales/vi.json` + `locales/en.json`**: viết lại block `giveaway` (33 key, vi có dấu), sửa `rerolled`, thêm `rerollFailed`/`noActive`/`listLine`/`ageInvalid`/`embed*`/`logWinners`, bỏ dead key `alreadyJoined`.
- **`config/constants.js`**: thêm `LIMITS.giveawayMaxAccountAgeDays`.
- **`scripts/test-giveaways.js`** (`npm run test:giveaways`): 91 test — create (regression `ReferenceError`, embed/nút vi+en, lang từ guild config, clamps), eligibility (role/age/rời server/không tồn tại), mutex (5 join đồng thời + click đúp), end/reroll (lọc điều kiện, idempotent, DM, xoá nút), listActive/restore, command-layer validation, interaction mapping, đủ 33 key vi/en + placeholder parity; sửa `scripts/check-giveaway-locale.js` (bỏ false-positive `registerComponent`).

### Kiểm chứng

- `npm run test:giveaways` → **91/91 pass**; khi **tạm tắt mutex** thì đúng 3 test mutex fail (chứng minh test bắt được bug thật) → đã khôi phục lock.
- `node scripts/check-giveaway-locale.js` → 33 key dùng/33 key có, **0 missing**, 0 unused.
- `npm run check` → 0 lỗi cú pháp; các suite cũ vẫn xanh: levels 28/28, economy 36/36, welcome 37/37.

## [2026-09-21] — Levels & XP: sửa lỗi i18n, đường admin grantXp, lỗi nuốt exception

### Nguyên nhân gốc

- Embed `rank`/`leaderboard`/`level` hard-code nhãn tiếng Anh (`Level`, `XP`, `Progress`, `XP required`…) dù locale đã có `levels.level/xp/progress` (vi phạm §24).
- `/levels addxp` dùng `addXp` (chỉ cộng số) → level-up qua đường admin **bỏ qua role reward và thông báo**, khác đường XP tự nhiên; key lỗi sai (`common.invalidInput` thay vì `levels.invalidAmount`), success key `levels.addXp` chưa dùng key `xpAdded` có sẵn.
- `announceLevelUp` render role reward bằng **hack `.split(' {')[0]` cắt cụt template** `roleRewardEarned` (mất param `{role}`) và có biến `lines` tính rồi bỏ.
- `messageCreate` nuốt exception XP bằng `.catch(() => {})` — lỗi service bị che.
- `grantXp` (admin) truyền `fallbackChannel = null` → guild chưa cấu hình `announceChannelId` thì **không bao giờ** có thông báo level-up.

### Sửa

- **`commands/levels/levels.js`**: toàn bộ nhãn embed qua `ctx.t('levels.*')` (kèm progress `{current}/{next}`); `addxp` chuyển sang `grantXp` (role reward + announce như XP tự nhiên), key `levels.invalidAmount`/`levels.xpAdded`; dọn thụt dòng.
- **`services/levelService.js`**: `announceLevelUp` render từng reward bằng `levels.roleRewardEarned` (đúng param `{role}/{level}`) nối vào description, bỏ hack `.split`; `grantXp` tự resolve fallback channel (`systemChannel` → kênh text đầu tiên bot gửi được) khi chưa cấu hình announce channel.
- **`events/messageCreate.js`**: lỗi XP được log (`logger.error('levels', …)`) thay vì nuốt.
- Thêm **`scripts/test-levels.js`** (`npm run test:levels`): 28 test — XP curve, cooldown, no-xp channel/role, bot skip, module toggle, multiplier, level-up (role reward + announce i18n vi/en, không rò placeholder), `grantXp` admin path, leaderboard sort/split key, đủ 16 key `levels.*` ở cả vi/en.

### Kiểm chứng

- `npm run test:levels` → **28/28 pass**; `npm run check` → 119 file, 0 lỗi; `test-welcome` 37/37; `check-ticket-locale` 0 missing key.

## [2026-09-21] — Economy: sửa double-spend, lỗ hổng admin, shop chết, daily hard-code, i18n

### Nguyên nhân gốc

- **`economyService`**: mọi mutation (`addWallet/removeWallet/deposit/withdraw/transfer/setWallet`) là read-modify-write **không có khoá** → 2 lệnh cùng lúc (ví dụ pay + work, hoặc 2 transfer) có thể **double-spend** / mất cập nhật (lost update). `addWallet` viết lều: `return saveAccount(...) && {...}`; `addWallet`/`transfer` dùng `account.wallet` ghi nhận `null` → tài khoản mới lần đầu **bỏ qua `startingBalance`**.
- **`cmdAdmin`**: kiểm tra quyền ở command-level là `member` → **mọi thành viên có thể `/economy admin add` tự đúng coins** (lỗ hổng tiền ảo). `remove` báo `insufficient` với `{balance:0}` hard-code (sai số dư thật).
- **`cmdDaily`**: hard-code `const amount = 500`, bỏ qua `config.economy.dailyAmount`.
- **`cmdShop`**: luôn render `shopEmpty` dù `config.economy.shop` có item → shop hiệu quả **chết chìêm**, các key `bought`/`roleItem`/`sold` chưa dùng.
- **`economy` command**: khai báo `bot: ['ManageGuild']` — bot **không cần ManageGuild** để đọc số dư → sai scope quyền.
- `workEarned` amount dùng `.toString()` (không dây phẩy).

### Sửa

- **`services/economyService.js`**:
  - Thêm `withAccountLock(keys, fn)` mutex theo `${guildId}:${userId}` (acquire theo thứ tự sort để tránh deadlock) bao phủ `addWallet/removeWallet/setWallet/transfer/deposit/withdraw/markDaily/markWork/addItem/removeItem/purchase`.
  - `addWallet` dùng `wallet` đã resolve (trường hợp mới = `startingBalance`).
  - `transfer` self-transfer chặn ở service; cả 2 save trong cùng lock → nguyên tử.
  - Thêm `purchase(guildId, userId, item)` — kiểm tra số dư → trừ tiền → cộng inventory trong 1 lock; trả `{ok, reason}`.
  - Validate amount (<=0 / NaN) → `null`.
- **`commands/economy/economy.js`**:
  - `cmdAdmin`: check `ctx.member.permissions.has('ManageGuild')` inline; `remove` dùng số dư thật; log lỗi `catch`.
  - `cmdDaily`: dùng `config.economy.dailyAmount` (fallback 500).
  - `cmdShop`: liệt kê item từ `config.economy.shop` (tên, giá, roleId, description); `shopEmpty` chỉ khi thực sự rỗng.
  - Thêm `cmdBuy` (`/economy buy <item>`) + subcommand + prefix `buy`; grant role nếu item có `roleId`, **hoàn tiền nếu grant role lỗi**.
  - `balance`: thêm field `net` (wallet+bank); `workEarned` dùng `toLocaleString()`.
  - Bỏ `bot: ['ManageGuild']` ở command-level.
- **`locales/vi.json` & `locales/en.json`**: thêm `economy.itemNotFound`, `economy.roleGrantFailed`.
- **`scripts/check-syntax.js`** (tái tạo): `node --check` toàn bộ file trong `src/` + `scripts/`.
- **`scripts/check-ticket-locale.js`**: bỏ qua dòng `registerComponent/Modal/Context` để tránh false-positive.
- Thêm **`scripts/test-economy.js`** (`npm run test:economy`): 36 test — validation, deposit/withdraw/transfer (balance, insufficient, double-spend), mutex lost-update, purchase (deduct + inventory + stack + insufficient + refund-on-role-fail), inventory add/remove, leaderboard sort+total, đủ 31 key `economy.*`.

### Kiểm chứng

- `npm run test:economy` → **36/36 pass**; `npm run check` → 119 file, 0 lỗi; `test:welcome` 37/37; `test:levels` 28/28; `check-ticket-locale` 0 missing key.

## [2026-09-20] — Tickets: sửa 8 lỗi hành vi theo §7 (i18n, close/reopen, transcript, isStaff)

### Nguyên nhân gốc

- **8 key i18n** dùng trong code (`panelSent, setupFailed, noOpen, notInChannel, alreadyClosed, claimed, claimFailed, deleted`) **không tồn tại** trong locale → người dùng thấy key thô `ticket.xxx` (vi phạm §24).
- `maxReached` bị map nhầm sang `alreadyOpen` (kèm param `{channel}` sai ngữ nghĩa — nói về kênh cũ của ticket khác).
- Panel khi `types` rỗng → select menu **0 option** → Discord API reject; `channel.send` không try/catch → lỗi generic khi thiếu quyền.
- **Transcript luôn cụt**: `messages.fetch({ limit: 500 })` trong 1 call nhưng Discord giới hạn **100/call** → trả tối đa 100 tin, thất bại thầm lặng.
- Close **không khoá kênh** (member vẫn nhắn sau khi close); `claimedBy` bị **ghi đè bằng người đóng** kể cả khi chưa ai claim; reopen không mở khoá.
- Toàn bộ embed/nút hard-code tiếng Anh trong `interactions/tickets.js` dù locale đã có sẵn `ticketTitle, claimBtn, closeBtn…` không được dùng.
- `isStaff` check **quyền guild** thay vì quyền trong kênh ticket → staff role được overwrite `ManageMessages` (chỉ trong kênh) vẫn bị chặn claim/close; ngược lại mod guild nhưng không có overwrite vẫn được phép.
- `memberAdded`/`memberRemoved` không truyền `{user}` → template render literal `{user}`.

### Sửa

- **Locale**: bổ sung đủ `ticket.*` cho vi/en (48 key), thêm `modalAddTitle/modalRemoveTitle/userIdLabel/notTicketChannel/noTypes/maxReached`; key message động (closed/claimed…) đưa vào **service** để cả slash lẫn button dùng chung.
- **`ticketService`**:
  - `createTicket`: chặn panel `types` rỗng (`noTypes`), wrap `channel.send` try/catch, map đúng `maxReached` với `{channel}` là kênh ticket đang mở của user.
  - `closeTicket`: **khoá kênh** (deny `SendMessages` cho `@everyone`, giữ staff) + rename `closed-<tên>`; `claimedBy` chỉ set khi claim thật; trả trạng thái để tránh rename trùng.
  - `reopenTicket`: mở khoá + rename bỏ tiền tố `closed-`.
  - `makeTranscript`: fetch **đúng 100 tin/call, loop bằng `before`** cho tới hết (giới hạn tổng bởi `tickets.transcriptMaxMessages`), ghép nội dung + attachment link.
- **`interactions/tickets.js`** viết lại: i18n 100% cho embed/nút/modal (`ticketTitle, ticketDescription, claimBtn, closeBtn, addBtn, removeBtn, deleteBtn, closeConfirm…`), `isStaff` dựa trên `permissionsFor(member)` **trong kênh ticket** (ManageMessages hoặc ViewChannel+SendMessages qua overwrites), param `{user}` đầy đủ cho member add/remove, không rename trùng với service.
- `scripts/check-ticket-locale.js`: quét key `ticket.*` dùng trong string literal so với locale.

### Kiểm chứng

- `node --check` cả 3 file sạch; `smoke-test`: **34 commands, 21 events, 0 error**.
- `check-ticket-locale`: 38 key thật dùng trong code — vi/en đủ 100%; 3 "missing" (`select, add, remove`) là **customId component** (`ticket:add`, `ticket:remove`), không phải key i18n (false positive đã xác minh bằng grep).
- Hồi quy: test-automod 18 ✅, test-logging 43 ✅, test-moderation 44 ✅, test-welcome 37 ✅.

### Lưu ý

- `scripts/check-ticket-locale.js` không được commit (`scripts/` trong `.gitignore`) — đã ghi chú tại đây và trong README module.
- `/ticket add|remove` member thao tác qua **button trong kênh ticket** (modal nhập user ID) — đã tài liệu hoá trong README.

## [2026-09-20] — Roles: hoàn thiện hệ role theo §6 (rolemenu/autorole/temprole/levelreward + reaction roles)

### Nguyên nhân gốc

- Hệ role chỉ có `/role` (moderation) + `/rolemenu` dạng button/select; spec §6 liệt kê **reaction roles, temporary roles, level roles** — cả 3 chưa tồn tại.
- `/rolemenu` không có giới hạn số lựa chọn: Discord cho tối đa 25 button (5×5) và 25 option/select, vượt là API reject → crash generic.
- `roleMenuService` gán/bỏ role trực tiếp không qua check `manageable` (role bot) → role cao hơn bot là throw, member thấy lỗi generic.
- Auto role chỉ nằm trong welcomeService (chạy kèm welcome message); không có lệnh quản trị độc lập `/autorole`.
- Level roles (`levels.roleRewards` trong guildDefaults) có config nhưng **không có logic áp dụng** — config chết.

### Sửa

- **`src/services/roleMenuService.js`**: 3 kiểu menu (buttons / select / **reaction**); check `role.editable` trước khi gán; `addRole/removeRole` fail-soft từng role; persist trong collection `role_menus`.
- **`src/services/tempRoleService.js`** (mới): temporary roles — grant/revoke thủ công + expiry tự động, **persist + `restore(client)` chạy từ `ready.js`** nên sống sót restart (cùng pattern với AutoMod lockdown).
- **`src/commands/roles/`**: `rolemenu` (validate ≤25 button/≤25 select/≤20 reaction), `autorole` (add/remove/list, chặn role `!editable` ngay khi cấu hình), `temprole` (grant/revoke/list, validate duration), `levelreward` (set/remove/list) — hết 30+ key i18n `roles.*` mới, vi/en đầy đủ.
- **`src/events/messageReactionAdd/Remove.js`** (mới): reaction roles theo `customId = menuId:emoji`, loại bots + partial, không throw ra ngoài event.
- **`src/interactions/roleMenus.js`**: route button/select của rolemenu qua componentHandler, check quyền + lỗi có thông báo.
- Level rewards áp dụng trong `levelService` khi member lên level (đọc `levels.roleRewards`, skip role không gán được).
- `src/index.js` + `ready.js`: đăng ký `tempRoleService.setClient` + restore; `interactionCreate` route thêm cho rolemenu.

### Kiểm chứng

- `node --check` toàn bộ `src/` + `scripts/` sạch; `smoke-test`: **34 commands, 21 events, 0 error**.
- `scripts/check-roles-locale.js` (mới): quét 30 key `roles.*` dùng trong string literal — vi/en đủ 100% (34/34, 0 missing).
- Hồi quy: test-moderation 44 ✅, test-automod 18 ✅, test-logging 43 ✅, test-welcome 37 ✅, test-automod-restart 19 ✅, lockdown ✅.

### Lưu ý

- `scripts/` nằm trong `.gitignore` → `test-*.js` + `check-roles-locale.js` không được commit; cách dùng đã ghi trong README của module tương ứng.
- Reaction roles giới hạn 20 lựa chọn/menu (Discord giới hạn số reaction khả dụng an toàn trên 1 tin nhắn).


## [2026-09-20] — Welcome/Goodbye: tách log khỏi message + autorole fail-soft (§5)

### Nguyên nhân gốc

- `sendWelcome` chỉ chạy auto-role **khi welcome message được bật và đã đặt kênh**: tắt `welcome.enabled` hay chưa đặt `channelId` là `return` sớm trước cả vòng gán role — member mới mất role oan dù spec §5 liệt kê "Auto role" là tính năng độc lập.
- Cùng một `return` sớm nuốt luôn cả log `memberJoin`: tắt welcome là mất dấu join trong kênh log members, vi phạm spec §4.
- `sendWelcome` đọc `member.guild.roles.cache.get(...)` rồi `member.roles.add` **không try/catch từng role**: role đã xóa (config còn id cũ), role cao hơn role bot, hay thiếu `ManageRoles` là cả hàm throw → event handler chỉ log lỗi, member mất toàn bộ role còn lại trong danh sách.
- Embed title hard-code `setTitle('👋 Chào mừng thành viên mới!')`: server đặt `language: en` vẫn nhận title tiếng Việt (vi phạm §24 — text phải qua i18n).
- Goodbye không có fallback: server dùng một kênh chung cho cả join/leave phải cấu hình channel 2 lần; trống `goodbye.channelId` là im lặng.
- Chưa check quyền gửi trước khi `channel.send` trong event path: thiếu `SendMessages` là throw → spam log lỗi mỗi lần có member join/leave.
- `scripts/test-welcome.js` tồn tại nhưng **không chạy được** (`node --check` báo `SyntaxError: Unexpected end of input` — thiếu `};` đóng mock `sendLog`, đè lên `async function` kế tiếp).

### Sửa

- `welcomeService.assignAutoRoles()` (mới, fail-soft từng role): skip role đã xóa / `!role.editable` (cao hơn bot, managed) / `roles.add` throw; trả `{ assigned, skipped }` để log + test. `/welcome autorole` từ chối ngay role `!editable` bằng key `welcome.roleTooHigh`.
- `sendWelcome`: gán role → log `memberJoin` → mới kiểm tra `modules.welcome`/`welcome.enabled`; thiếu kênh, kênh non-text, thiếu quyền (`canSendIn`: SendMessages + ViewChannel + SendMessagesInThreads cho thread) đều `return` lặng thay vì throw.
- Role bị skip → log cảnh báo `logging.events.autoroleSkipped` (key đã có sẵn từ đợt Logging) vào kênh members.
- `sendGoodbye`: log `memberLeave` độc lập với message; `goodbye.channelId || welcome.channelId` (fallback kênh chung); `allowedMentions: { parse: [] }` để không ping người đã rời; `member.partial` (không cache user) render placeholder rỗng, không crash.
- Embed title qua `i18n.translate(config.language, ...)` cả hai chiều vi/en (`buildWelcomePayload`/`buildGoodbyePayload` nhận thêm `language`).
- `scripts/test-welcome.js` viết lại hoàn chỉnh (37 case: 5 placeholder + missing user, title vi/en, autorole fail-soft, 4 nhánh welcome, 5 nhánh goodbye); `package.json` thêm `test:welcome`; `src/commands/welcome/README.md` viết lại (quy ước + bảng troubleshooting).

### Kiểm chứng

```bash
npm run test:welcome  # 37 passed, 0 failed
npm test              # smoke test: 31 command, 19 event, 0 error
```

## [2026-09-20] — Moderation: gom logic vào service + sửa các lỗi hành vi §2

### Nguyên nhân gốc

- `/warn` thủ công **không bao giờ leo thang** dù `config.moderation.warnAutoPunish` được tài liệu là dùng chung — thang escalation chỉ được gọi từ nhánh AutoMod.
- `/warnings` crash bằng lỗi generic khi member có **26+ warn** (Discord reject embed > 25 field).
- `/purge` **im lặng xóa thiếu**: Discord không bulk-delete tin > 14 ngày mà code không báo số tin bị bỏ qua.
- `!ban @user` thất bại khi member **chưa cache** (join trước khi bot online) — `prefixParser` chỉ tìm trong `members.cache`, bỏ qua `message.mentions.users` vốn luôn có user.
- `/ban` không ban được user **đã rời server** — `getMember` trả null là dừng, trong khi Discord cho phép `guild.members.ban(userId)`.
- `/role add|remove` check hierarchy **inline và ném TypeError** khi `guild.members.me` chưa cache; không chặn trường hợp member đã có/chưa có role; `create` không validate màu hex; `delete` không chặn `@everyone` và role managed.
- `/unban` fetch toàn bộ ban list rồi mới báo lỗi (chậm), và không phân biệt "không có trong ban list" với "unban thất bại".
- `/timeout` và `/slowmode` render literal `{duration}`/`{channel}` vì không truyền param cho template.

### Sửa

- `moderationService.applyWarnEscalation()` (mới, dùng chung `/warn` + AutoMod): đọc `config.moderation.warnAutoPunish`, match đúng `count`, hỗ trợ `timeout`/`kick`/`ban`, fail-safe (thiếu `moderatable`/`kickable`/`bannable` → `null` thay vì throw). `warn.js` gọi sau mỗi warn, thêm DM notify tùy chọn (`notify` bool, template `warnNotifyDm`) và template `warnEscalated`.
- `warnings.js`: cap 25 field mới nhất + footer `warningsCount` / `warningsTruncated`; tra moderator từ cache trước (tránh fetch 1 member/case gây rate limit).
- `bulkDelete()` trả `{ deleted, skipped }`; `purge.js` dùng template `purgeSkipped` khi có tin quá tuổi.
- `prefixParser`: fallback `message.mentions.users` → `!ban @user` chạy được cho member chưa cache (giữ `member` unresolved để `ban()` dùng đường userId).
- `ban()`: chấp nhận plain User (đã rời server) — bỏ qua check hierarchy (không còn role), gọi `guild.members.ban(userId)`.
- `role.js` viết lại: dùng `canModerate` + `botCanAct` của service, `botCanManageRole()` fail-safe qua `role.manageable`; `add` báo info `roleAlready`, `remove` báo info `roleMissing`; `create` validate hex + tên bắt buộc; `delete` chặn `@everyone`/`managed`; log add/remove ở đây, log create/delete để event đảm nhiệm.
- `unban.js`: check `bans.get(id)` trước khi gọi API (fail fast `unbanFail` đúng nghĩa).
- `timeout.js`/`slowmode.js`: truyền đủ param cho template (`{duration}`, `{channel}`).
- Locale vi/en: đồng bộ 54 key `moderation.*` (thêm `warnEscalated`, `warnNotifyDm`, `purgeSkipped`, `warningsTruncated`, `roleAlready`, `roleMissing`, `roleEveryone`, `roleManaged`, `roleNameRequired`, `invalidColor`…).

### Kiểm chứng

```bash
npm run test:moderation  # 44 passed — locale/template, escalation ladder, warnings cap, role CRUD, purge skipped, prefix uncached
npm run test:logging     # 43 passed (không regress)
npm run test:automod     # 18 passed (ladder dùng chung không phá AutoMod)
npm test                 # smoke test: 31 command, 19 event, 0 error
```

## [2026-09-20] — Logging: hiện thực toàn bộ sự kiện §4 + sửa lệnh `/log`

### Nguyên nhân gốc

Locale `logging.events.*` (messageDelete, messageEdit, role*/channel*, nickname, voice*) **đã có sẵn**
nhưng **chưa từng có event handler nào** dùng chúng: `src/events/` chỉ có 8 file và không có listener cho
message delete/edit, role, channel, nickname hay voice. Ngoài ra lệnh `/log` thiếu subcommand `channel`
mà spec §4 ghi rõ, và nhánh xoá kênh theo category dùng nhầm key i18n.

### Sửa

- **Thêm 11 event handler** (đăng ký tự động: 8 → 19 event):
  `messageDelete`, `messageUpdate`, `messageDeleteBulk`, `guildMemberUpdate`,
  `roleCreate`, `roleDelete`, `roleUpdate`, `channelCreate`, `channelDelete`, `channelUpdate`,
  `voiceStateUpdate`.
- **`channelUpdate` bao gồm permission overwrite** → `/lock`, `/unlock` và mọi thay đổi quyền kênh
  được log mà không cần thêm code trong command (tránh log trùng).
- **`guildMemberUpdate` là chủ sở hữu duy nhất của log nickname** (kèm audit log để biết ai đổi);
  đã bỏ log trùng trong `src/commands/moderation/nick.js`. Timeout cố ý **không** log ở đây vì
  `moderationService`/AutoMod đã log kèm moderator.
- `src/utils/auditLog.js` (mới): `findExecutor()` lấy người thực hiện từ audit log, chỉ nhận entry đúng
  target trong ~15s để không gán nhầm moderator; delay chỉnh được qua env `AUDIT_LOG_DELAY_MS`.
- `loggingService`: hỗ trợ `payload.titleKey` và `field.nameKey` (dịch bằng ngôn ngữ của guild bên trong
  `sendLog`, không cần đọc config thêm); thêm `diff(before, after, keys)` dùng chung cho role/channel;
  chuẩn hoá field (name/value cắt độ dài, value rỗng → `-`).
- Lệnh `/log`: thêm subcommand **`channel`** (§4), sửa nhánh xoá category (trước đây render literal
  `{status}`), nhãn trong `/log list` dùng key đúng (`logging.defaultChannel`, `logging.usesDefault`),
  validate category + `isTextBased`, và **cảnh báo khi bot thiếu `SendMessages`/`EmbedLinks`** ở kênh vừa đặt
  (nguyên nhân phổ biến khiến "log không chạy" mà không có lỗi nào).
- Locale vi/en: thêm `logging.fields.*` (25 nhãn), `logging.events.bulkDelete`, `logging.defaultChannel`,
  `logging.usesDefault`, `logging.categoryCleared`, `logging.missingPerms`.

### Bộ lọc có chủ đích (ghi rõ để không bị coi là bug)

- `messageDelete`/`messageUpdate` bỏ qua message của bot (panel poll/ticket/giveaway bị bot sửa liên tục);
  `messageUpdate` chỉ log khi nội dung đổi.
- `voiceStateUpdate` bỏ mute/deaf và member là bot (music bot).
- `roleUpdate`/`channelUpdate` chỉ log khi có thuộc tính được theo dõi thay đổi.

### Kiểm chứng

```bash
npm run test:logging   # 43 passed — routing, fallback, i18n, diff, 13 event case, chống log rác
npm test               # smoke test: 12 service, 31 command, 19 event, 0 error
```

Trong lúc làm phát hiện và loại bỏ **2 ký tự soft hyphen (U+00AD) vô hình** lọt vào
`loggingService.js` (sẽ hiển thị sai trong embed) — đã thay bằng ASCII `-`.

## [2026-09-20] — AutoMod: sửa lỗi nghiêm trọng làm mất quyền `@everyone` sau restart

### Nguyên nhân gốc

`automodService.lockDown()` xoá toàn bộ quyền của `@everyone` khi phát hiện raid, rồi hẹn giờ mở khóa bằng `setTimeout` **trong bộ nhớ**. Nếu process chết (restart/deploy/crash) giữa lúc lockdown, timer biến mất và quyền `@everyone` bị khoá **vĩnh viễn** — không có cách nào tự phục hồi. Ngoài ra cửa sổ đếm join cũng nằm trong bộ nhớ nên raid đang diễn ra bị "reset" sau restart.

### Sửa

- `src/services/automodService.js`
  - Thêm collection `automod_state`: `{ lockdown: { until, previous }, joins: [...] }` + helper `readState` / `writeState` (không bao giờ throw; bỏ qua lỗi "Database not initialized" khi chạy test).
  - `lockDown()` ghi deadline + snapshot quyền **trước khi** arm timer, và **abort** (không xoá quyền) nếu ghi thất bại — một lockdown không có snapshot trên đĩa là không thể phục hồi.
  - `unlockDown()` dùng snapshot truyền vào, nếu không có thì đọc snapshot đã persist (đúng đường đi sau restart) rồi mới fallback về `DEFAULT_RESTORE`; xoá state sau khi mở khoá.
  - Thêm `restore(client)`: nạp lại cửa sổ join, mở khoá ngay nếu lockdown đã hết hạn, re-arm timer nếu còn hạn, xoá state nếu bot đã rời guild.
  - `handleJoin()` đọc cửa sổ join đã persist khi bộ nhớ trống và persist lại sau mỗi join.
- `src/events/ready.js`: gọi `automodService.restore(client)` cùng nhóm restore timer bền vững.
- `src/events/guildMemberAdd.js`: log trung tính ("Mass-join action fired") vì `handleJoin` có thể trả về cả nhánh `alert`.

### Sửa kèm trong cùng module

- `handleJoin()` trước đây **luôn** lockdown, bỏ qua `rules.massJoin.action`. Nay `action: 'alert'` chỉ gửi log cho staff, không đụng vào quyền; `'lockdown'` giữ nguyên hành vi cũ (mặc định vẫn là `'lockdown'` nên không giảm mức bảo vệ của cấu hình cũ).
- `antiMention` chỉ đếm `message.mentions.users.size` nên **role-mention spam không bao giờ bị phát hiện**. Nay cộng cả `mentions.roles.size`, và chịu được message không có collection `roles` (partial).
- `src/events/messageCreate.js`: mỗi message đọc guild config 2 lần (AutoMod + prefix) → nay đọc 1 lần, chia sẻ qua `ctx` cục bộ của event (không sửa ctx dùng chung, tránh race giữa các message).
- `src/models/guildDefaults.js`: thêm `massJoin.lockdownMinutes` vào default (trước đây service phải tự fallback).

### Kiểm chứng

```bash
npm run test:automod          # 18 passed — thêm case antiMention role + export restore
npm run test:lockdown         # vòng lockDown → unlockDown giữ nguyên quyền
npm run test:automod-restart  # 19 passed — mô phỏng restart thật bằng cách xoá require cache
npm test                      # smoke test: 12 service, 31 command, 8 event
```

`test:automod-restart` là test hồi quy trực tiếp cho lỗi trên: lockDown → "restart" → kiểm tra lockdown được re-arm, lockdown hết hạn được mở khoá đúng snapshot, cả hai chế độ `massJoin.action`, và nhánh DB lỗi phải abort mà không xoá quyền.

## [2026-09-20] — Các bản sửa trước trong cùng phiên

- **`/economy` + `!economy`**: `ReferenceError: economyCommand is not defined` — thiếu hàm dispatcher và handler `work` / `pay`; đồng thời sửa hàng loạt key i18n lệch giữa code và `locales/{vi,en}.json` (nếu không, người dùng thấy chuỗi key thô).
- **`/ban` + `!ban`**: `slashBuilder.OPTION_TYPES` thiếu `member` nên option `user:` bị đăng ký sai thành kiểu STRING (3) thay vì USER (6) — ảnh hưởng mọi lệnh moderation; `commandHandler` nay resolve được cả trường hợp member không cache / đã rời server (`value.user` fallback).
