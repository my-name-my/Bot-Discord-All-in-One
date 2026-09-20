# Discord Bot All-in-One

Bot Discord đa chức năng: moderation, automod, logging, welcome, roles, tickets, levels, economy, giveaways, utility. Chạy đồng thời **slash + prefix commands**, cấu hình riêng từng server, 2 ngôn ngữ (vi/en).

> Spec gốc: [`PROMT.md`](./PROMT.md). 31 slash commands, 16 categories, chế độ **guild-only** (không dùng global commands).

## Tính năng

| Module | Lệnh chính | Docs |
|---|---|---|
| Moderation | `/ban /kick /timeout /warn /purge /lock /slowmode /nick /role …` (15 lệnh) | [`src/commands/moderation/README.md`](./src/commands/moderation/README.md) |
| AutoMod | `/automod status/toggle/rule/badword/ignore` | [`src/commands/automod/README.md`](./src/commands/automod/README.md) |
| Logging | `/log setup/channel/category/toggle/list` | [`src/commands/logging/README.md`](./src/commands/logging/README.md) |
| Welcome / Goodbye | `/welcome /goodbye` (channel, message, autorole, embed, test) | [`src/commands/welcome/README.md`](./src/commands/welcome/README.md) |
| Roles | `/rolemenu create/delete/list` (button/select role) | [`src/commands/roles/README.md`](./src/commands/roles/README.md) |
| Tickets | `/ticket setup/list/close/reopen/delete/claim` | [`src/commands/tickets/README.md`](./src/commands/tickets/README.md) |
| Levels & XP | `/levels rank/leaderboard/level/addxp` | [`src/commands/levels/README.md`](./src/commands/levels/README.md) |
| Economy | `/economy balance/daily/work/deposit/withdraw/pay/shop/inventory/admin` | [`src/commands/economy/README.md`](./src/commands/economy/README.md) |
| Giveaways | `/giveaway create/end/reroll/list` | [`src/commands/giveaways/README.md`](./src/commands/giveaways/README.md) |
| Utility | `/utility ping/avatar/userinfo/serverinfo …` (12 sub) | [`src/commands/utility/README.md`](./src/commands/utility/README.md) |
| Config | `/config prefix/language/module/view/reset` | [`src/commands/config/README.md`](./src/commands/config/README.md) |
| Context menu | Chuột phải user → `Profile` | [`src/commands/context/README.md`](./src/commands/context/README.md) |
| Config | `/config prefix/language/module/view/reset` | [`src/commands/config/README.md`](./src/commands/config/README.md) |
| Context menu | Chuột phải user → `Profile` | [`src/commands/context/README.md`](./src/commands/context/README.md) |

Hạ tầng: [handlers](./src/handlers/README.md) · [services](./src/services/README.md) · [events](./src/events/README.md) · [interactions](./src/interactions/README.md) · [database](./src/database/README.md).

## Cài đặt

```bash
npm install
cp .env.example .env   # điền DISCORD_TOKEN, CLIENT_ID
```

`.env` tối thiểu:

```env
DISCORD_TOKEN="..."
CLIENT_ID="..."
PREFIX="!"
DEFAULT_LANGUAGE="vi"
AUTO_REGISTER_COMMANDS=true
```

## Chạy

```bash
npm start            # chạy bot (tự đăng ký guild slash + clear global)
npm run dev          # watch mode
node scripts/deploy-commands.js --guild <GUILD_ID>   # deploy tay 1 server
GUILD_IDS="id1,id2" node scripts/deploy-commands.js  # deploy nhiều server
```

> Guild-only mode: slash đăng ký theo từng server (hiện ngay), global commands bị xóa. Server mới join tự được đăng ký qua `guildCreate`.

## Kiến trúc

```
src/
├── commands/<module>/*.js   # export { name, permissions, subcommands, run(ctx) }
├── handlers/                # loader, parser, slashBuilder, component router, Context
├── services/                # business logic dùng chung (không import command)
├── events/                  # clientReady, guildCreate, messageCreate, interactionCreate…
├── interactions/            # button/select/modal routes (customId module:action:…)
├── database/ models/ utils/ config/
locales/{vi,en}.json         # i18n — không hard-code text trong command
```

Nguyên tắc: 1 `run(ctx)` dùng chung slash + prefix; service 1 chiều (command → service); permission check 2 lớp (tier user + quyền bot); mọi lỗi trả i18n, không crash.

## Thêm lệnh mới

1. Tạo file theo mẫu trong [`src/handlers/README.md`](./src/handlers/README.md#thêm-command-mới-mẫu-chung).
2. `npm run check` (syntax) → restart → `node scripts/deploy-commands.js --guild <id>`.
3. Thêm key text vào `locales/vi.json` + `en.json`.
4. Cập nhật README của module.

## Scripts

| Script | Việc |
|---|---|
| `npm start / dev` | Chạy bot |
| `npm run deploy-commands` | Deploy slash (`--guild <id>`) |
| `npm run check` | Check syntax toàn bộ |
| `npm test` / `load-test` | Smoke test / tải |
