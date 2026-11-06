/**
 * 数据完整性与性能优化：
 * 1. 清理此前因 SQLite 外键未开启而残留的孤儿数据
 * 2. 为高频查询的外键列补充索引
 * 3. 新增 completed_at 字段，用于统计"今日完成"等 AI 复盘数据
 */
exports.up = async function (knex) {
  await knex.raw('DELETE FROM task_tags WHERE task_id NOT IN (SELECT id FROM tasks) OR tag_id NOT IN (SELECT id FROM tags)');
  await knex.raw('DELETE FROM subtasks WHERE task_id NOT IN (SELECT id FROM tasks)');
  await knex.raw('DELETE FROM task_notes WHERE task_id NOT IN (SELECT id FROM tasks)');

  await knex.raw('CREATE INDEX IF NOT EXISTS subtasks_task_id_sort_index ON subtasks (task_id, sort_order)');
  await knex.raw('CREATE INDEX IF NOT EXISTS task_notes_task_id_created_index ON task_notes (task_id, created_at)');
  await knex.raw('CREATE INDEX IF NOT EXISTS task_tags_tag_id_index ON task_tags (tag_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS tasks_created_at_index ON tasks (created_at)');

  const hasCompletedAt = await knex.schema.hasColumn('tasks', 'completed_at');
  if (!hasCompletedAt) {
    await knex.schema.alterTable('tasks', (table) => {
      table.timestamp('completed_at').nullable();
    });
    // 历史已完成任务用 updated_at 近似回填
    await knex('tasks').where({ status: 'done' }).update({ completed_at: knex.ref('updated_at') });
  }
};

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS subtasks_task_id_sort_index');
  await knex.raw('DROP INDEX IF EXISTS task_notes_task_id_created_index');
  await knex.raw('DROP INDEX IF EXISTS task_tags_tag_id_index');
  await knex.raw('DROP INDEX IF EXISTS tasks_created_at_index');
  const hasCompletedAt = await knex.schema.hasColumn('tasks', 'completed_at');
  if (hasCompletedAt) {
    // 使用原生 DROP COLUMN（SQLite >= 3.35），避免 knex 重建表时在外键开启状态下级联删除子表数据
    await knex.raw('ALTER TABLE tasks DROP COLUMN completed_at');
  }
};
