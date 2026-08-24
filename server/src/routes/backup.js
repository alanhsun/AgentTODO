const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { finished } = require('stream/promises');
const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const yazl = require('yazl');
const config = require('../config');
const { getDb } = require('../db');
const { validateBackup } = require('../validators/backup');
const {
  STORED_NAME_PATTERN,
  ensureAttachmentDir,
  sanitizeOriginalName,
  resolveStoredPath,
  removeAttachmentFiles,
} = require('../utils/attachmentStorage');

const router = express.Router();

async function readDatabaseData(db, includeAttachments = false) {
  const data = {
    tasks: await db('tasks'),
    tags: await db('tags'),
    task_tags: await db('task_tags'),
    subtasks: await db('subtasks'),
    task_notes: await db('task_notes'),
    task_occurrences: await db('task_occurrences'),
    webhooks: await db('webhooks'),
  };
  if (includeAttachments) data.task_attachments = await db('task_attachments');
  return data;
}

async function replaceDatabaseData(trx, data, includeAttachments = false) {
  await trx('task_attachments').del();
  await trx('agent_requests').del();
  await trx('task_occurrences').del();
  await trx('task_tags').del();
  await trx('subtasks').del();
  await trx('task_notes').del();
  await trx('tasks').del();
  await trx('tags').del();
  await trx('webhooks').del();

  if (data.tags?.length > 0) await trx('tags').insert(data.tags);
  if (data.tasks?.length > 0) await trx('tasks').insert(data.tasks);
  if (data.task_tags?.length > 0) await trx('task_tags').insert(data.task_tags);
  if (data.subtasks?.length > 0) await trx('subtasks').insert(data.subtasks);
  if (data.task_notes?.length > 0) await trx('task_notes').insert(data.task_notes);
  if (data.task_occurrences?.length > 0) await trx('task_occurrences').insert(data.task_occurrences);
  if (data.webhooks?.length > 0) await trx('webhooks').insert(data.webhooks);
  if (includeAttachments && data.task_attachments?.length > 0) {
    await trx('task_attachments').insert(data.task_attachments);
  }
}

function validateAttachmentRows(rows, taskRows) {
  const taskIds = new Set(taskRows.map((task) => Number(task.id)));
  const storedNames = new Set();
  const cleaned = [];
  let totalBytes = 0;

  for (const row of rows) {
    const id = Number(row.id);
    const taskId = Number(row.task_id);
    const size = Number(row.size);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(taskId) || !taskIds.has(taskId)) {
      throw new Error('Attachment metadata references an invalid task');
    }
    if (!STORED_NAME_PATTERN.test(row.stored_name) || storedNames.has(row.stored_name)) {
      throw new Error('Attachment metadata contains an invalid stored name');
    }
    if (!Number.isSafeInteger(size) || size < 0 || size > config.attachmentMaxBytes) {
      throw new Error('Attachment size is invalid or exceeds the configured limit');
    }
    if (!/^[0-9a-f]{64}$/i.test(row.sha256 || '')) {
      throw new Error('Attachment checksum is invalid');
    }
    totalBytes += size;
    if (totalBytes > config.backupMaxBytes) throw new Error('Attachment archive is too large');
    storedNames.add(row.stored_name);
    cleaned.push({
      id,
      task_id: taskId,
      stored_name: row.stored_name,
      original_name: sanitizeOriginalName(row.original_name),
      mime_type: String(row.mime_type || 'application/octet-stream').slice(0, 255),
      size,
      sha256: row.sha256.toLowerCase(),
      created_at: row.created_at || new Date().toISOString(),
    });
  }
  return cleaned;
}

// Legacy JSON backup. Binary attachment files are intentionally omitted.
router.get('/export', async (req, res) => {
  try {
    const db = getDb();
    const data = await readDatabaseData(db);
    const [{ count }] = await db('task_attachments').count('* as count');
    res.json({
      version: 1,
      timestamp: new Date().toISOString(),
      attachments_omitted: Number(count),
      data,
    });
  } catch (error) {
    console.error('Backup export failed:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Legacy JSON restore. Since it has no binary files, current attachments are removed.
router.post('/import', async (req, res) => {
  const backup = req.body;
  const validationError = validateBackup(backup, { allowedVersions: [1] });
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const db = getDb();
    const existingAttachments = await db('task_attachments').select('stored_name');
    await db.transaction((trx) => replaceDatabaseData(trx, backup.data));
    await removeAttachmentFiles(existingAttachments.map((attachment) => attachment.stored_name));
    return res.json({ message: 'Import successful' });
  } catch (error) {
    console.error('Backup import failed:', error);
    return res.status(500).json({ error: 'Import failed' });
  }
});

// Full database and attachment archive.
router.get('/export.zip', async (req, res) => {
  try {
    const db = getDb();
    const data = await readDatabaseData(db, true);
    await Promise.all(data.task_attachments.map((attachment) => fs.access(resolveStoredPath(attachment.stored_name))));

    const backup = {
      version: 3,
      format: 'agenttodo-full',
      timestamp: new Date().toISOString(),
      data,
    };
    res.attachment(`agenttodo-full-backup-${backup.timestamp.slice(0, 10)}.zip`);
    res.type('application/zip');

    const archive = new yazl.ZipFile();
    archive.outputStream.on('error', (error) => res.destroy(error));
    archive.outputStream.pipe(res);
    archive.addBuffer(Buffer.from(JSON.stringify(backup, null, 2)), 'backup.json');
    data.task_attachments.forEach((attachment) => {
      archive.addFile(
        resolveStoredPath(attachment.stored_name),
        `attachments/${attachment.stored_name}`,
      );
    });
    archive.end();
    await finished(archive.outputStream);
  } catch (error) {
    console.error('Full backup export failed:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Full export failed' });
    else res.destroy(error);
  }
});

const backupUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      const uploadDir = path.join(path.dirname(config.attachmentDir), '.backup-uploads');
      fs.mkdir(uploadDir, { recursive: true }).then(() => callback(null, uploadDir), callback);
    },
    filename(_req, _file, callback) {
      callback(null, `${crypto.randomUUID()}.zip`);
    },
  }),
  limits: { files: 1, fileSize: config.backupMaxBytes },
});

async function readZipEntry(entry, maxBytes) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of entry.stream()) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) throw new Error('Archive entry exceeds its declared size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, totalBytes);
}

async function restoreFullArchive(archivePath) {
  const archive = await unzipper.Open.file(archivePath);
  const manifestEntry = archive.files.find((entry) => entry.path === 'backup.json' && entry.type === 'File');
  if (!manifestEntry || Number(manifestEntry.vars?.uncompressedSize || 0) > 50 * 1024 * 1024) {
    throw new Error('Archive is missing a valid backup.json');
  }

  let backup;
  try {
    backup = JSON.parse((await readZipEntry(manifestEntry, 50 * 1024 * 1024)).toString('utf8'));
  } catch (_error) {
    throw new Error('Archive manifest is not valid JSON');
  }
  const validationError = validateBackup(backup, { allowedVersions: [2, 3] });
  if (validationError || backup.format !== 'agenttodo-full') {
    throw new Error(validationError || 'Unsupported full backup format');
  }

  const attachments = validateAttachmentRows(backup.data.task_attachments, backup.data.tasks);
  backup.data.task_attachments = attachments;
  const entryMap = new Map(archive.files.map((entry) => [entry.path, entry]));
  const parentDir = path.dirname(config.attachmentDir);
  const importId = crypto.randomUUID();
  const stagingDir = path.join(parentDir, `.attachments-import-${importId}`);
  const previousDir = path.join(parentDir, `.attachments-previous-${importId}`);
  await fs.mkdir(stagingDir, { recursive: true });

  let oldDirectoryMoved = false;
  let newDirectoryInstalled = false;
  try {
    for (const attachment of attachments) {
      const entry = entryMap.get(`attachments/${attachment.stored_name}`);
      if (!entry || entry.type !== 'File') throw new Error(`Attachment ${attachment.original_name} is missing`);
      const contents = await readZipEntry(entry, attachment.size);
      if (contents.length !== attachment.size) throw new Error('Attachment size verification failed');
      const checksum = crypto.createHash('sha256').update(contents).digest('hex');
      if (checksum !== attachment.sha256) throw new Error('Attachment checksum verification failed');
      await fs.writeFile(path.join(stagingDir, attachment.stored_name), contents, { flag: 'wx' });
    }

    await fs.mkdir(parentDir, { recursive: true });
    try {
      await fs.rename(config.attachmentDir, previousDir);
      oldDirectoryMoved = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await fs.rename(stagingDir, config.attachmentDir);
    newDirectoryInstalled = true;

    await getDb().transaction((trx) => replaceDatabaseData(trx, backup.data, true));
    if (oldDirectoryMoved) {
      await fs.rm(previousDir, { recursive: true, force: true }).catch((cleanupError) => {
        console.error('Failed to remove previous attachment directory:', cleanupError);
      });
    }
  } catch (error) {
    if (newDirectoryInstalled) await fs.rm(config.attachmentDir, { recursive: true, force: true });
    else await fs.rm(stagingDir, { recursive: true, force: true });
    if (oldDirectoryMoved) await fs.rename(previousDir, config.attachmentDir);
    throw error;
  }
}

router.post('/import.zip', (req, res) => {
  backupUpload.single('backup')(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError.code === 'LIMIT_FILE_SIZE'
        ? 'Backup archive exceeds the configured limit'
        : 'Invalid backup upload';
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: 'Backup archive is required' });

    try {
      await ensureAttachmentDir();
      await restoreFullArchive(req.file.path);
      return res.json({ message: 'Full import successful' });
    } catch (error) {
      console.error('Full backup import failed:', error);
      return res.status(400).json({ error: error.message || 'Full import failed' });
    } finally {
      await fs.unlink(req.file.path).catch(() => {});
    }
  });
});

module.exports = router;
