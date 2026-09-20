# Services

Business logic dùng chung, tái sử dụng giữa slash/prefix/component (§26.3 PROMT).

| Service | Dùng bởi | Persist |
|---|---|---|
| `moderationService` | ban/kick/timeout/… | case log (DB/JSON) |
| `warningService` | warn/warnings/unwarn/clearwarns | warns per guild |
| `automodService` | messageCreate hook | config per guild |
| `loggingService` | mọi service + error reporter | guild log channels |
| `guildConfigService` | config, prefix, i18n, module gate | guild document |
| `levelService` | levels, profile, messageCreate XP | xp per (guild,user) |
| `economyService` | economy, games, profile | wallet/bank/inventory |
| `giveawayService` | giveaways + interaction | giveaways + entries |
| `pollService` | polls/utility poll + interaction | polls + votes |
| `reminderService` | reminders/utility remind | reminders |
| `roleMenuService` | rolemenu + interaction | menus |
| `notificationService` | notify + poller | sources + lastSeen |
| `ticketService` | tickets + interaction | tickets |
| `welcomeService` | welcome/goodbye events | guild config |
| `permissionService` | commandHandler gate | role-tier map |
| `cooldownService` | commandHandler, daily/work | memory |
| `i18nService` | `ctx.t()` | `locales/*.json` |

## Nguyên tắc

- Service không import command; command gọi service — 1 chiều, tránh circular.
- Timer-based service (`giveaway`, `poll`, `reminder`, `notification`) phải có `setClient(client)` + `restore(client)` để sống sót sau restart.
- Thêm service mới: tạo file, lazy-require trong `index.js` ctx.services, không sửa API cũ (§26.12–13).
