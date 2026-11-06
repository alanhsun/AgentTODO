const path = require('path');
const config = require('./src/config');

/**
 * SQLite 默认关闭外键约束，这会导致迁移中声明的 ON DELETE CASCADE 完全失效
 * （删除任务后子任务/笔记/标签关联会变成孤儿数据）。
 * 因此每个新连接建立时都必须显式开启。
 */
function afterCreate(conn, done) {
  conn.run('PRAGMA foreign_keys = ON', done);
}

const base = {
  client: 'sqlite3',
  useNullAsDefault: true,
  migrations: {
    directory: path.join(__dirname, 'migrations'),
  },
};

module.exports = {
  development: {
    ...base,
    connection: {
      filename: config.dbPath,
    },
    pool: { afterCreate },
  },
  test: {
    ...base,
    connection: {
      filename: ':memory:',
    },
    pool: {
      min: 1,
      max: 1,
      idleTimeoutMillis: 360000 * 1000,
      afterCreate,
    },
  },
  production: {
    ...base,
    connection: {
      filename: process.env.DB_PATH || '/data/tasks.db',
    },
    pool: { afterCreate },
  },
};
