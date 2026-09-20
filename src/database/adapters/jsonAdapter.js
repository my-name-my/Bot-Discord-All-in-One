/**
 * JSON adapter — the zero-dependency fallback storage.
 * One pretty-printed file per collection inside <dataDir>/db.
 * Writes are debounced (250 ms) and flushed on exit so restarts are safe.
 */
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

class JSONAdapter {
  constructor(dataDir) {
    this.type = 'json';
    this.dir = path.join(dataDir, 'db');
    this.cache = new Map();
    this.dirty = new Set();
    this.timer = null;
  }

  async connect() {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  fileFor(name) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`Invalid collection name: ${name}`);
    return path.join(this.dir, `${name}.json`);
  }

  load(name) {
    if (!this.cache.has(name)) {
      try {
        this.cache.set(name, JSON.parse(fs.readFileSync(this.fileFor(name), 'utf8')));
      } catch {
        this.cache.set(name, {});
      }
    }
    return this.cache.get(name);
  }

  async get(name, id) {
    const data = this.load(name);
    return id in data ? data[id] : null;
  }

  async set(name, id, doc) {
    const data = this.load(name);
    data[id] = doc;
    this.markDirty(name);
    return doc;
  }

  async delete(name, id) {
    const data = this.load(name);
    if (id in data) {
      delete data[id];
      this.markDirty(name);
    }
  }

  async all(name) {
    return Object.entries(this.load(name)).map(([id, doc]) => ({ id, ...doc }));
  }

  markDirty(name) {
    this.dirty.add(name);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 250);
      if (typeof this.timer.unref === 'function') this.timer.unref();
    }
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const name of this.dirty) {
      this.dirty.delete(name);
      try {
        fs.writeFileSync(this.fileFor(name), JSON.stringify(this.load(name), null, 2));
      } catch (error) {
        logger.error('DB/json', `Failed to persist ${name}: ${error.message}`);
      }
    }
  }

  async close() {
    this.flush();
  }
}

module.exports = JSONAdapter;
