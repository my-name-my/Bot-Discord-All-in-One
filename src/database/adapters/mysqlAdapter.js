/**
 * Adapter MySQL / MariaDB (goi tuy chon: mysql2).
 * Moi collection la mot bang voi cot id TEXT + cot du lieu JSON.
 * Moi gia tri deu truyen dang tham so rang buoc — chong SQL injection.
 */
const logger = require('../../utils/logger');

class MySQLAdapter {
  constructor(url) {
    this.type = 'mysql';
    this.url = url;
    this.pool = null;
    this.createdTables = new Set();
  }

  async connect() {
    let mysql;
    try {
      mysql = require('mysql2/promise');
    } catch {
      throw new Error('DATABASE_URL uses mysql:// but mysql2 is not installed. Run: npm install mysql2');
    }
    this.pool = mysql.createPool({ uri: this.url, connectionLimit: 5, waitForConnections: true });
    logger.info('DB/mysql', 'Connection pool created');
  }

  tableName(name) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`Invalid collection name: ${name}`);
    return name;
  }

  async ensure(name) {
    const table = this.tableName(name);
    if (!this.createdTables.has(table)) {
      await this.pool.query(
        `CREATE TABLE IF NOT EXISTS ${table} (id VARCHAR(255) PRIMARY KEY, data JSON NOT NULL)`
      );
      this.createdTables.add(table);
    }
    return table;
  }

  async get(name, id) {
    const table = await this.ensure(name);
    const [rows] = await this.pool.query(`SELECT data FROM ${table} WHERE id = ?`, [id]);
    return rows.length ? (typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data) : null;
  }

  async set(name, id, doc) {
    const table = await this.ensure(name);
    await this.pool.query(
      `INSERT INTO ${table} (id, data) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data)`,
      [id, JSON.stringify(doc)]
    );
    return doc;
  }

  async delete(name, id) {
    const table = await this.ensure(name);
    await this.pool.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
  }

  async all(name) {
    const table = await this.ensure(name);
    const [rows] = await this.pool.query(`SELECT id, data FROM ${table}`);
    return rows.map((row) => ({
      id: row.id,
      ...(typeof row.data === 'string' ? JSON.parse(row.data) : row.data),
    }));
  }

  async close() {
    if (this.pool) await this.pool.end();
  }
}

module.exports = MySQLAdapter;
