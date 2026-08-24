/**
 * Task attachment metadata. Binary contents are stored on disk.
 */
exports.up = function (knex) {
  return knex.schema.createTable('task_attachments', (table) => {
    table.increments('id').primary();
    table.integer('task_id').unsigned().notNullable()
      .references('id').inTable('tasks').onDelete('CASCADE');
    table.string('stored_name', 64).notNullable().unique();
    table.string('original_name', 255).notNullable();
    table.string('mime_type', 255).defaultTo('application/octet-stream');
    table.integer('size').unsigned().notNullable();
    table.string('sha256', 64).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index(['task_id', 'created_at']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('task_attachments');
};
