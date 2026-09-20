# Database migrations

The bot auto-creates its schema on startup (`CREATE TABLE IF NOT EXISTS`), so
running the SQL files in this folder manually is **optional**. They are
provided for DBAs who prefer to pre-provision tables (e.g. without granting
DDL rights to the bot user).

Each storage adapter stores collections as:

| Adapter   | Table shape                                        |
| --------- | -------------------------------------------------- |
| SQLite    | `id TEXT PRIMARY KEY, data TEXT (JSON)`            |
| PostgreSQL| `id TEXT PRIMARY KEY, data JSONB`                  |
| MySQL     | `id VARCHAR(255) PRIMARY KEY, data JSON`           |

Collections used by the bot:

- `guilds` — per-guild configuration documents
- `warnings` — moderation case history per user
- `levels` — XP/level per guild+user
- `economy` — wallet/bank/inventory per guild+user
- `tickets` — ticket records
- `giveaways` — giveaway state
- `rolemenus` — role menu (select menu) definitions

## Files

- `001_init_sqlite.sql`
- `001_init_postgres.sql`
- `001_init_mysql.sql`

Apply with e.g. `psql "$DATABASE_URL" -f migrations/001_init_postgres.sql`.

> **NOTE:** All runtime queries use bound parameters. Identifiers (table
> names) come only from the fixed list above and are validated with
> `^[a-zA-Z0-9_-]+$` before use.
