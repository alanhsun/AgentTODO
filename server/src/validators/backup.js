const BACKUP_TABLES = ['tasks', 'tags', 'task_tags', 'subtasks', 'task_notes', 'webhooks'];
const FULL_BACKUP_TABLES = [...BACKUP_TABLES, 'task_attachments'];
const CURRENT_BACKUP_TABLES = [...FULL_BACKUP_TABLES, 'task_occurrences'];
const MAX_BACKUP_RECORDS = 100000;

function validateBackup(backup, { allowedVersions = [1] } = {}) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return 'Invalid backup format';
  }
  if (!allowedVersions.includes(backup.version) || !backup.data || typeof backup.data !== 'object') {
    return 'Unsupported or missing backup version';
  }

  let totalRecords = 0;
  const tables = backup.version >= 3
    ? CURRENT_BACKUP_TABLES
    : (backup.version === 2 ? FULL_BACKUP_TABLES : BACKUP_TABLES);
  for (const table of tables) {
    const rows = backup.data[table];
    if (backup.version >= 2 && rows === undefined) {
      return `Backup field ${table} is required`;
    }
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

module.exports = {
  validateBackup,
};
