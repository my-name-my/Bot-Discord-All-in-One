/**
 * SQLite adapter (optional dependency: better-sqlite3).
 * Each collection is a table with a TEXT primary key and a JSON data
 * column. All statements are parameterized — no string interpolation
 * of user input ever reaches SQL.
 */
const logger = require('../../utils/logger');

class SQLiteAdapter {
  constructor(file) {
    this.type = 'sqlite';
    this.file = file || './data/bot.db';
    this.db = null;
    this.statements = new Map();
    this.createdTables = new Set();
  }

  async connect() {
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch {
      throw new Error(
        'DATABASE_URL uses sqlite:// but better-sqlite3 is not installed. Run: npm install better-sqlite3'
      );
    }
    this.db = new Database(this.file);
    this.db.pragma('journal_mode = WAL');
    logger.info('DB/sqlite', `Opened ${this.file}`);
  }

  tableName(name) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`Invalid collection name: ${name}`);
    return name;
  }

  ensure(name) {
    const table = this.tableName(name);
    if (!this.createdTables.has(table)) {
      this.db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
      this.createdTables.add(table);
    }
    return table;
  }

  prepared(key, sql) {
    if (!this.statements.has(key)) {
      this.statements.set(key, this.db.prepare(sql));
    }
    return this.statements.get(key);
  }

  async get(name, id) {
    const table = this.ensure(name);
    const row = this.prepared(`${table}:get`, `SELECT data FROM ${table} WHERE id = ?`).get(id);
    return row ? JSON.parse(row.data) : null;
  }

  async set(name, id, doc) {
    const table = this.ensure(name);
    this.prepared(
      `${table}:set`,
      `INSERT INTO ${table} (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`
    ).run(id, JSON.stringify(doc));
    return doc;
  }

  async delete(name, id) {
    const table = this.ensure(name);
    this.prepared(`${table}:delete`, `DELETE FROM ${table} WHERE id = ?`).run(id);
  }

  async all(name) {
    const table = this.ensure(name);
    const rows = this.prepared(`${table}:all`, `SELECT id, data FROM ${table}`).all();
    return rows.map((row) => ({ id: row.id, ...JSON.parse(row.data) }));
  }

  async close() {
    if (this.db) this.db.close();
  }
}

module.exports = SQLiteAdapter;
