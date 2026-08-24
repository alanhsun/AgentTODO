const fs = require('fs');
const multer = require('multer');
const express = require('express');
const config = require('../config');
const { getDb } = require('../db');
const {
  ensureAttachmentDir,
  createStoredName,
  sanitizeOriginalName,
  resolveStoredPath,
  hashFile,
  removeAttachmentFile,
  isPreviewableMime,
  serializeAttachment,
} = require('../utils/attachmentStorage');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      ensureAttachmentDir().then(() => callback(null, config.attachmentDir), callback);
    },
    filename(_req, _file, callback) {
      callback(null, createStoredName());
    },
  }),
  limits: {
    fileSize: config.attachmentMaxBytes,
    files: 1,
  },
});

async function requireTask(req, res, next) {
  try {
    const task = await getDb()('tasks').where({ id: req.params.taskId }).first();
    if (!task) return res.status(404).json({ error: 'Task not found' });
    req.task = task;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function findAttachment(req) {
  return getDb()('task_attachments')
    .where({ id: req.params.attachmentId, task_id: req.params.taskId })
    .first();
}

router.get('/:taskId/attachments', requireTask, async (req, res, next) => {
  try {
    const attachments = await getDb()('task_attachments')
      .where({ task_id: req.params.taskId })
      .orderBy('created_at', 'desc');
    res.json(attachments.map(serializeAttachment));
  } catch (error) {
    next(error);
  }
});

router.post('/:taskId/attachments', requireTask, (req, res) => {
  upload.single('file')(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError.code === 'LIMIT_FILE_SIZE'
        ? `File exceeds the ${Math.floor(config.attachmentMaxBytes / 1024 / 1024)} MB limit`
        : 'Invalid attachment upload';
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: 'File is required' });

    try {
      const sha256 = await hashFile(req.file.path);
      const [id] = await getDb()('task_attachments').insert({
        task_id: Number(req.params.taskId),
        stored_name: req.file.filename,
        original_name: sanitizeOriginalName(req.file.originalname),
        mime_type: String(req.file.mimetype || 'application/octet-stream').slice(0, 255),
        size: req.file.size,
        sha256,
        created_at: new Date().toISOString(),
      });
      const attachment = await getDb()('task_attachments').where({ id }).first();
      return res.status(201).json(serializeAttachment(attachment));
    } catch (error) {
      await removeAttachmentFile(req.file.filename).catch((cleanupError) => {
        console.error('Failed to clean up rejected attachment:', cleanupError);
      });
      console.error('Attachment upload failed:', error);
      return res.status(500).json({ error: 'Attachment upload failed' });
    }
  });
});

router.get('/:taskId/attachments/:attachmentId/download', requireTask, async (req, res, next) => {
  try {
    const attachment = await findAttachment(req);
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
    const filePath = resolveStoredPath(attachment.stored_name);
    await fs.promises.access(filePath, fs.constants.R_OK);
    res.set('X-Content-Type-Options', 'nosniff');
    return res.download(filePath, attachment.original_name);
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ error: 'Attachment file not found' });
    return next(error);
  }
});

router.get('/:taskId/attachments/:attachmentId/preview', requireTask, async (req, res, next) => {
  try {
    const attachment = await findAttachment(req);
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
    if (!isPreviewableMime(attachment.mime_type)) {
      return res.status(415).json({ error: 'Attachment cannot be previewed safely' });
    }
    const filePath = resolveStoredPath(attachment.stored_name);
    await fs.promises.access(filePath, fs.constants.R_OK);
    res.set({
      'Content-Type': attachment.mime_type,
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300',
    });
    return res.sendFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ error: 'Attachment file not found' });
    return next(error);
  }
});

router.delete('/:taskId/attachments/:attachmentId', requireTask, async (req, res, next) => {
  try {
    const attachment = await findAttachment(req);
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
    await getDb()('task_attachments').where({ id: attachment.id }).del();
    await removeAttachmentFile(attachment.stored_name).catch((cleanupError) => {
      console.error('Failed to remove deleted attachment file:', cleanupError);
    });
    return res.json({ message: 'Attachment deleted' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
