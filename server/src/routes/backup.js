const express = require('express');
const { getDb } = require('../db');
const { asyncHandler, HttpError } = require('../utils/http');
const { broadcastEvent } = require('../services/eventService');

const router = express.Router();

const BACKUP_VERSION = 2;

// 导入顺序需满足外键依赖：父表在前，子表在后
const TABLES = ['tags', 'tasks', 'task_tags', 'subtasks', 'task_notes', 'webhooks'];
// SQLite 单条语句的绑定变量数量有限，大备份需要分批插入
const INSERT_CHUNK_SIZE = 200;

// GET /api/backup/export - Export all database state as JSON
router.get('/export', asyncHandler(async (req, res) => {
  const db = getDb();
  const data = {};
  for (const table of TABLES) {
    data[table] = await db(table);
  }

  const backupData = {
    version: BACKUP_VERSION,
    timestamp: new Date().toISOString(),
    data,
  };

  const filename = `agenttodo-backup-${backupData.timestamp.slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.json(backupData);
}));

// POST /api/backup/import - Import database state from JSON (replaces all data)
router.post('/import', asyncHandler(async (req, res) => {
  const backup = req.body;

  if (!backup || typeof backup !== 'object' || !backup.data || typeof backup.data !== 'object') {
    throw new HttpError(400, 'Invalid backup format: missing "data" object');
  }
  for (const table of TABLES) {
    const rows = backup.data[table];
    if (rows !== undefined && !Array.isArray(rows)) {
      throw new HttpError(400, `Invalid backup format: "${table}" must be an array`);
    }
  }

  const db = getDb();
  const counts = {};

  try {
    await db.transaction(async (trx) => {
      // 子表先删，父表后删
      for (const table of [...TABLES].reverse()) {
        await trx(table).del();
      }

      for (const table of TABLES) {
        const rows = backup.data[table] || [];
        if (rows.length === 0) {
          counts[table] = 0;
          continue;
        }
        // 只保留当前表结构中存在的列，兼容不同版本导出的备份
        const columns = Object.keys(await trx(table).columnInfo());
        const cleaned = rows.map((row) => {
          const out = {};
          columns.forEach((c) => { if (row && row[c] !== undefined) out[c] = row[c]; });
          return out;
        });
        for (let i = 0; i < cleaned.length; i += INSERT_CHUNK_SIZE) {
          await trx(table).insert(cleaned.slice(i, i + INSERT_CHUNK_SIZE));
        }
        counts[table] = cleaned.length;
      }
    });
  } catch (error) {
    // 数据本身有问题（如外键/唯一约束冲突）属于客户端错误
    if (error && typeof error.code === 'string' && error.code.startsWith('SQLITE_CONSTRAINT')) {
      throw new HttpError(400, `Import failed: ${error.message}`);
    }
    throw error;
  }

  broadcastEvent('backup.imported', { imported: counts });
  res.json({ message: 'Import successful', imported: counts });
}));

module.exports = router;
