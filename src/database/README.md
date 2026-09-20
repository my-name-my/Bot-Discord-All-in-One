# Database & Models & Utils & Config

## Database (`src/database/`)

- `initDatabase()` chọn backend theo `DATABASE_URL`: rỗng → JSON (`data/db/*.json`, zero-setup); `sqlite://` → better-sqlite3; `postgres://` → pg; `mysql://` → mysql2.
- Query luôn parameterized (§26.10). Service lazy-require db qua ctx, không giữ connection riêng.

## Models (`src/models/`)

Schema / shape chuẩn của document: guild config, warn case, ticket, giveaway, poll, reminder, economy account, level row. Service nào persist shape nào thì import model đó để validate.

## Utils (`src/utils/`)

| File | Dùng để |
|---|---|
| `time.js` | `parseDuration('1h30m')`, `formatDuration` |
| `embeds.js` | Tạo embed chuẩn màu theo module |
| `logger.js` | Log `[time] [level] [scope]` |
| `permissions.js` | Check tier + bot perms, hierarchy |
| `validators.js` | Validate input user |

## Config (`src/config/`)

- `config.js` đọc `.env` (token, prefix, `AUTO_REGISTER_COMMANDS`, `DEV_GUILD_ID`, `GUILD_IDS`, DB, Twitch). Không hard-code secret (§26.9).
- `constants.js`: màu embed, limits, rule lists.
