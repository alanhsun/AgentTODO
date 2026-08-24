const crypto = require('crypto');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const config = require('../config');

const STORED_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREVIEWABLE_MIME_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

async function ensureAttachmentDir() {
  await fsPromises.mkdir(config.attachmentDir, { recursive: true });
}

function createStoredName() {
  return crypto.randomUUID();
}

function sanitizeOriginalName(value) {
  const input = String(value || 'attachment');
  const baseName = path.posix.basename(path.win32.basename(input))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return (baseName || 'attachment').slice(0, 255);
}

function resolveStoredPath(storedName) {
  if (!STORED_NAME_PATTERN.test(storedName)) throw new Error('Invalid stored attachment name');
  return path.join(config.attachmentDir, storedName);
}

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function removeAttachmentFile(storedName) {
  try {
    await fsPromises.unlink(resolveStoredPath(storedName));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function removeAttachmentFiles(storedNames) {
  const results = await Promise.allSettled(storedNames.map(removeAttachmentFile));
  results.forEach((result) => {
    if (result.status === 'rejected') console.error('Failed to remove attachment file:', result.reason);
  });
}

function isPreviewableMime(mimeType) {
  return PREVIEWABLE_MIME_TYPES.has(mimeType);
}

function serializeAttachment(row) {
  const publicFields = { ...row };
  delete publicFields.stored_name;
  return {
    ...publicFields,
    size: Number(row.size),
    download_url: `/api/tasks/${row.task_id}/attachments/${row.id}/download`,
    preview_url: isPreviewableMime(row.mime_type)
      ? `/api/tasks/${row.task_id}/attachments/${row.id}/preview`
      : null,
  };
}

module.exports = {
  STORED_NAME_PATTERN,
  ensureAttachmentDir,
  createStoredName,
  sanitizeOriginalName,
  resolveStoredPath,
  hashFile,
  removeAttachmentFile,
  removeAttachmentFiles,
  isPreviewableMime,
  serializeAttachment,
};
