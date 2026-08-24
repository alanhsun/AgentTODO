const knex = require('knex');
const config = require('./config');
const knexConfig = require('../knexfile');

let db;

function getDb() {
  if (!db) {
    const env = config.nodeEnv === 'test' ? 'test' : (config.nodeEnv === 'production' ? 'production' : 'development');
    db = knex(knexConfig[env]);
  }
  return db;
}

async function initDb() {
  const instance = getDb();
  await instance.migrate.latest();
  if (config.nodeEnv !== 'test') {
    await instance.raw('PRAGMA journal_mode = WAL');
  }
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
