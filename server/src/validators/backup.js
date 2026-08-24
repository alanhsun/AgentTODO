const BACKUP_TABLES = ['tasks', 'tags', 'task_tags', 'subtasks', 'task_notes', 'webhooks'];
const MAX_BACKUP_RECORDS = 100000;

function validateBackup(backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return 'Invalid backup format';
  }
  if (backup.version !== 1 || !backup.data || typeof backup.data !== 'object') {
    return 'Unsupported or missing backup version';
  }

  let totalRecords = 0;
  for (const table of BACKUP_TABLES) {
    const rows = backup.data[table];
    if (rows !== undefined && !Array.isArray(rows)) {
      return `Backup field ${table} must be an array`;
    }
    totalRecords += rows?.length || 0;
  }

  if (totalRecords > MAX_BACKUP_RECORDS) {
    return `Backup contains more than ${MAX_BACKUP_RECORDS} records`;
  }
  return null;
}

module.exports = { validateBackup, BACKUP_TABLES, MAX_BACKUP_RECORDS };
