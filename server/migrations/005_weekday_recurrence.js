const RECURRENCES = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];
const LEGACY_RECURRENCES = ['none', 'daily', 'weekly', 'monthly'];

function exec(connection, sql) {
  return new Promise((resolve, reject) => {
    connection.exec(sql, (error) => (error ? reject(error) : resolve()));
  });
}

function all(connection, sql) {
  return new Promise((resolve, reject) => {
    connection.all(sql, (error, rows) => (error ? reject(error) : resolve(rows)));
  });
}

function quote(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function rebuildTasksTable(knex, recurrences, recurrenceExpression = 'recurrence') {
  const connection = await knex.client.acquireConnection();
  const allowedRecurrences = recurrences.map(quote).join(', ');

  try {
    await exec(connection, 'PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;');
    await exec(connection, `
      DROP TABLE IF EXISTS tasks_weekday_rebuild;
      CREATE TABLE tasks_weekday_rebuild (
        id integer NOT NULL PRIMARY KEY AUTOINCREMENT,
        title varchar(255) NOT NULL,
        description text DEFAULT '',
        status text CHECK (status IN ('todo', 'in_progress', 'done')) DEFAULT 'todo',
        priority text CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
        due_date date NULL,
        created_at datetime DEFAULT CURRENT_TIMESTAMP,
        updated_at datetime DEFAULT CURRENT_TIMESTAMP,
        recurrence text CHECK (recurrence IN (${allowedRecurrences})) DEFAULT 'none',
        recurrence_end date NULL
      );
      INSERT INTO tasks_weekday_rebuild (
        id, title, description, status, priority, due_date,
        created_at, updated_at, recurrence, recurrence_end
      )
      SELECT
        id, title, description, status, priority, due_date,
        created_at, updated_at, ${recurrenceExpression}, recurrence_end
      FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_weekday_rebuild RENAME TO tasks;
      CREATE INDEX tasks_status_index ON tasks (status);
      CREATE INDEX tasks_priority_index ON tasks (priority);
      CREATE INDEX tasks_due_date_index ON tasks (due_date);
    `);

    const violations = await all(connection, 'PRAGMA foreign_key_check;');
    if (violations.length > 0) {
      throw new Error(`Foreign key check failed while updating recurrence values: ${JSON.stringify(violations)}`);
    }

    await exec(connection, 'COMMIT; PRAGMA foreign_keys = ON;');
  } catch (error) {
    try {
      await exec(connection, 'ROLLBACK; PRAGMA foreign_keys = ON;');
    } catch {
      // Preserve the original migration failure.
    }
    throw error;
  } finally {
    await knex.client.releaseConnection(connection);
  }
}

exports.up = async function up(knex) {
  await rebuildTasksTable(knex, RECURRENCES);
};

exports.down = async function down(knex) {
  await rebuildTasksTable(
    knex,
    LEGACY_RECURRENCES,
    "CASE WHEN recurrence = 'weekdays' THEN 'daily' ELSE recurrence END",
  );
};

// PRAGMA foreign_keys cannot be changed from inside Knex's migration transaction.
exports.config = { transaction: false };
