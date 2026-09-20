/**
 * DatabaseManager — cua ngõ duy nhat vao kho luu tru, tach biet khoi
 * lenh va service. Du lieu to chuc dang "collection" cac document
 * khoa bang id chuoi. Adapter dang dung chon theo DATABASE_URL:
 *
 *   (empty)            → JSON files in data/db (zero-setup fallback)
 *   sqlite://...       → better-sqlite3 (optional dependency)
 *   postgres://...     → pg (optional dependency)
 *   mysql://...        → mysql2 (optional dependency)
 *
 * Cac adapter SQL chi dung cau lenh tham so hoa (xem adapters/*).
 */
const config = require('../config/config');
const logger = require('../utils/logger');

class Collection {
  constructor(name, adapter) {
    this.name = name;
    this.adapter = adapter;
  }

  /** @returns {Promise<object|null>} document da luu (khong gom id) */
  async get(id) {
    return this.adapter.get(this.name, id);
  }

  /** Chen moi hoac ghi de mot document. */
  async set(id, doc) {
    if (doc === null || doc === undefined || typeof doc !== 'object') {
      throw new Error(`Collection.set(${this.name}, ${id}) requires an object`);
    }
    return this.adapter.set(this.name, id, doc);
  }

  async delete(id) {
    return this.adapter.delete(this.name, id);
  }

  /** @returns {Promise<Array<{id: string} & object>>} danh sach document kem id */
  async all() {
    return this.adapter.all(this.name);
  }

  async find(predicate) {
    return (await this.all()).filter(predicate);
  }

  async count() {
    return (await this.all()).length;
  }
}

class DatabaseManager {
  constructor(adapter) {
    this.adapter = adapter;
    this.collections = new Map();
  }

  get type() {
    return this.adapter.type;
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Collection(name, this.adapter));
    }
    return this.collections.get(name);
  }

  async connect() {
    await this.adapter.connect();
  }

  async close() {
    await this.adapter.close();
  }
}

let instance = null;

async function createAdapter() {
  const url = config.databaseUrl.trim();
  if (!url) {
    logger.info('DB', 'DATABASE_URL not set → using JSON storage (data/db/*.json)');
    const JSONAdapter = require('./adapters/jsonAdapter');
    return new JSONAdapter(config.dataDir);
  }

  if (url.startsWith('sqlite://') || url.startsWith('sqlite:')) {
    const file = url.replace(/^sqlite:\/\//, '').replace(/^sqlite:/, '');
    const SQLiteAdapter = require('./adapters/sqliteAdapter');
    return new SQLiteAdapter(file);
  }

  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const PostgresAdapter = require('./adapters/postgresAdapter');
    return new PostgresAdapter(url);
  }

  if (url.startsWith('mysql://') || url.startsWith('mariadb://')) {
    const MySQLAdapter = require('./adapters/mysqlAdapter');
    return new MySQLAdapter(url.replace(/^mariadb:\/\//, 'mysql://'));
  }

  throw new Error(`Unsupported DATABASE_URL scheme "${url.split(':')[0]}". Use sqlite://, postgres:// or mysql://`);
}

/**
 * Khoi tao instance database dung chung. Chi goi dung mot lan khi khoi dong.
 */
async function initDatabase() {
  if (instance) return instance;
  const adapter = await createAdapter();
  instance = new DatabaseManager(adapter);
  await instance.connect();
  logger.info('DB', `Database ready → ${instance.type}`);
  return instance;
}

function getDatabase() {
  if (!instance) throw new Error('Database not initialized — call initDatabase() first');
  return instance;
}

/** Dung cho test de tiem adapter gia. */
function _setInstance(manager) {
  instance = manager;
}

module.exports = { initDatabase, getDatabase, DatabaseManager, Collection, _setInstance };
