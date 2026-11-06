const fs = require('fs');
const path = require('path');
const knex = require('knex');
const config = require('./config');
const knexConfig = require('../knexfile');

let db;

function resolveEnv() {
  if (config.nodeEnv === 'test') return 'test';
  if (config.nodeEnv === 'production') return 'production';
  return 'development';
}

/** SQLite 不会自动创建父目录：全新 clone 时 server/data/ 不存在会导致 SQLITE_CANTOPEN */
function ensureDbDirectory(filename) {
  if (!filename || filename === ':memory:') return;
  fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
}

function getDb() {
  if (!db) {
    const envConfig = knexConfig[resolveEnv()];
    ensureDbDirectory(envConfig.connection && envConfig.connection.filename);
    db = knex(envConfig);
  }
  return db;
}

async function initDb() {
  const instance = getDb();
  await instance.migrate.latest();
  return instance;
}

async function closeDb() {
  if (db) {
    await db.destroy();
    db = null;
  }
}

// Allow overriding for tests
function setDb(instance) {
  db = instance;
}

module.exports = { getDb, initDb, closeDb, setDb };
