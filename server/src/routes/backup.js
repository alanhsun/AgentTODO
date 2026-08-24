const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { validateBackup } = require('../validators/backup');

// GET /api/backup/export - Export all database state as JSON
router.get('/export', async (req, res) => {
  try {
    const db = getDb();
    const tasks = await db('tasks');
    const tags = await db('tags');
    const task_tags = await db('task_tags');
    const subtasks = await db('subtasks');
    const task_notes = await db('task_notes');
    const webhooks = await db('webhooks');
    
    const backupData = {
      version: 1,
      timestamp: new Date().toISOString(),
      data: {
        tasks,
        tags,
        task_tags,
        subtasks,
        task_notes,
        webhooks
      }
    };
    
    res.json(backupData);
  } catch (error) {
    console.error('Backup export failed:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// POST /api/backup/import - Import database state from JSON
router.post('/import', async (req, res) => {
  const backup = req.body;
  
  const validationError = validateBackup(backup);
  if (validationError) return res.status(400).json({ error: validationError });
  
  try {
    const db = getDb();
    await db.transaction(async (trx) => {
      // Clear existing records
      await trx('task_tags').del();
      await trx('subtasks').del();
      await trx('task_notes').del();
      await trx('tasks').del();
      await trx('tags').del();
      await trx('webhooks').del();
      
      // Insert new records
      const data = backup.data;
      if (data.tags && data.tags.length > 0) await trx('tags').insert(data.tags);
      if (data.tasks && data.tasks.length > 0) await trx('tasks').insert(data.tasks);
      if (data.task_tags && data.task_tags.length > 0) await trx('task_tags').insert(data.task_tags);
      if (data.subtasks && data.subtasks.length > 0) await trx('subtasks').insert(data.subtasks);
      if (data.task_notes && data.task_notes.length > 0) await trx('task_notes').insert(data.task_notes);
      if (data.webhooks && data.webhooks.length > 0) await trx('webhooks').insert(data.webhooks);
    });
    
    res.json({ message: 'Import successful' });
  } catch (error) {
    console.error('Backup import failed:', error);
    res.status(500).json({ error: 'Import failed' });
  }
});

module.exports = router;
