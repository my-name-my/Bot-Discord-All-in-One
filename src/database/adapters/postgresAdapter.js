/**
 * PostgreSQL adapter (optional dependency: pg).
 * Each collection is a table with TEXT id + JSONB data column.
 * Every query is parameterized ($1, $2) — identifiers (table names) are
 * validated against a strict allowlist pattern, not user input.
 */
const logger = require('../../utils/logger');

class PostgresAdapter {
  constructor(url) {
    this.type = 'postgres';
    this.url = url;
    this.pool = null;
    this.createdTables = new Set();
  }

  async connect() {
    let pg;
    try {
      pg = require('pg');
    } catch {
      throw new Error('DATABASE_URL uses postgres:// but pg is not installed. Run: npm install pg');
    }
    this.pool = new pg.Pool({ connectionString: this.url, max: 5 });
    this.pool.on('error', (error) => logger.error('DB/pg', error.message));
    logger.info('DB/pg', 'Connection pool created');
  }

  tableName(name) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`Invalid collection name: ${name}`);
    return name;
  }

  async ensure(name) {
    const table = this.tableName(name);
    if (!this.createdTables.has(table)) {
      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
      this.createdTables.add(table);
    }
    return table;
  }

  async get(name, id) {
    const table = await this.ensure(name);
    const result = await this.pool.query(`SELECT data FROM ${table} WHERE id = $1`, [id]);
    return result.rows.length ? result.rows[0].data : null;
  }

  async set(name, id, doc) {
    const table = await this.ensure(name);
    await this.pool.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [id, doc]
    );
    return doc;
  }

  async delete(name, id) {
    const table = await this.ensure(name);
    await this.pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  }

  async all(name) {
    const table = await this.ensure(name);
    const result = await this.pool.query(`SELECT id, data FROM ${table}`);
    return result.rows.map((row) => ({ id: row.id, ...row.data }));
  }

  async close() {
    if (this.pool) await this.pool.end();
  }
}

module.exports = PostgresAdapter;
