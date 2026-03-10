const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/backup/export - Export all database state as JSON
router.get('/export', async (req, res) => {
  try {
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
    res.status(500).json({ error: 'Export failed: ' + error.message });
  }
});

// POST /api/backup/import - Import database state from JSON
router.post('/import', async (req, res) => {
  const backup = req.body;
  
  if (!backup || !backup.data) {
    return res.status(400).json({ error: 'Invalid backup format' });
  }
  
  try {
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
    res.status(500).json({ error: 'Import failed: ' + error.message });
  }
});

module.exports = router;
