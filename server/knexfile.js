const path = require('path');

function configureSqliteConnection(connection, done) {
  connection.exec([
    'PRAGMA foreign_keys = ON',
    'PRAGMA busy_timeout = 5000',
  ].join('; '), (error) => done(error, connection));
}

const sharedPoolConfig = {
  afterCreate: configureSqliteConnection,
};

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, 'data', 'tasks.db')
    },
    useNullAsDefault: true,
    pool: sharedPoolConfig,
    migrations: {
      directory: path.join(__dirname, 'migrations')
    }
  },
  test: {
    client: 'sqlite3',
    connection: {
      filename: ':memory:'
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'migrations')
    },
    pool: {
      ...sharedPoolConfig,
      min: 1,
      max: 1,
      idleTimeoutMillis: 360000 * 1000,
    }
  },
  production: {
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_PATH || '/data/tasks.db'
    },
    useNullAsDefault: true,
    pool: sharedPoolConfig,
    migrations: {
      directory: path.join(__dirname, 'migrations')
    }
  }
};
