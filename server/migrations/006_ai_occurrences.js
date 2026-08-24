/**
 * Lightweight AI reliability data:
 * - one row per completed recurring occurrence
 * - one short-lived request id per atomic AI progress update
 */
exports.up = function up(knex) {
  return knex.schema
    .createTable('task_occurrences', (table) => {
      table.integer('task_id').unsigned().notNullable()
        .references('id').inTable('tasks').onDelete('CASCADE');
      table.date('occurrence_date').notNullable();
      table.timestamp('completed_at').notNullable();
      table.string('source', 20).defaultTo('user');
      table.primary(['task_id', 'occurrence_date']);
      table.index(['occurrence_date']);
    })
    .createTable('agent_requests', (table) => {
      table.string('request_id', 100).primary();
      table.integer('task_id').unsigned().notNullable()
        .references('id').inTable('tasks').onDelete('CASCADE');
      table.string('action', 50).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['created_at']);
    });
};

exports.down = function down(knex) {
  return knex.schema
    .dropTableIfExists('agent_requests')
    .dropTableIfExists('task_occurrences');
};
