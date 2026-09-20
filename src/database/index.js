/**
 * DatabaseManager — the single entry point to storage, decoupled from
 * commands and services. Data is organized as "collections" of documents
 * keyed by a string id. The active adapter is chosen from DATABASE_URL:
 *
 *   (empty)            → JSON files in data/db (zero-setup fallback)
 *   sqlite://...       → better-sqlite3 (optional dependency)
 *   postgres://...     → pg (optional dependency)
 *   mysql://...        → mysql2 (optional dependency)
 *
 * SQL adapters use parameterized statements only (see adapters/*).
 */
const config = require('../config/config');
const logger = require('../utils/logger');

class Collection {
  constructor(name, adapter) {
    this.name = name;
    this.adapter = adapter;
  }

  /** @returns {Promise<object|null>} the stored document (without id) */
  async get(id) {
    return this.adapter.get(this.name, id);
  }

  /** Insert or overwrite a document. */
  async set(id, doc) {
    if (doc === null || doc === undefined || typeof doc !== 'object') {
      throw new Error(`Collection.set(${this.name}, ${id}) requires an object`);
    }
    return this.adapter.set(this.name, id, doc);
  }

  async delete(id) {
    return this.adapter.delete(this.name, id);
  }

  /** @returns {Promise<Array<{id: string} & object>>} */
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
 * Initialize the global database instance. Called exactly once at boot.
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

/** Used by tests to inject a fake adapter. */
function _setInstance(manager) {
  instance = manager;
}

module.exports = { initDatabase, getDatabase, DatabaseManager, Collection, _setInstance };
