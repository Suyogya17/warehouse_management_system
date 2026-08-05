const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const CHAT_UPLOAD_ROOT = path.resolve(
  String(process.env.CHAT_UPLOAD_DIR || '').trim() ||
    path.join(__dirname, '..', 'private_uploads', 'chat')
);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

fs.mkdirSync(CHAT_UPLOAD_ROOT, { recursive: true });

const DOCUMENT_TYPES = new Map([
  ['application/pdf', { extension: '.pdf', signature: 'pdf' }],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    { extension: '.docx', signature: 'zip' },
  ],
  [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    { extension: '.xlsx', signature: 'zip' },
  ],
]);

const AUDIO_TYPES = new Map([
  ['audio/webm', { extension: '.webm', signature: 'webm' }],
  ['audio/ogg', { extension: '.ogg', signature: 'ogg' }],
  ['audio/mp4', { extension: '.m4a', signature: 'mp4' }],
  ['audio/x-m4a', { extension: '.m4a', signature: 'mp4' }],
]);

const isImage = (file) => String(file?.mimetype || '').startsWith('image/');

const assertDocumentSignature = (buffer, signature) => {
  if (signature === 'pdf' && buffer.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('The selected PDF is not a valid PDF file.');
  }
  if (
    signature === 'zip' &&
    !(buffer[0] === 0x50 && buffer[1] === 0x4b)
  ) {
    throw new Error('The selected Office document is not valid.');
  }
};

const assertAudioSignature = (buffer, signature) => {
  const valid =
    (signature === 'webm' &&
      buffer.length >= 4 &&
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3) ||
    (signature === 'ogg' && buffer.subarray(0, 4).toString() === 'OggS') ||
    (signature === 'mp4' && buffer.length >= 12 && buffer.subarray(4, 8).toString() === 'ftyp');

  if (!valid) throw new Error('The recorded voice message is invalid or unsupported.');
};

const storeChatAttachment = async (file) => {
  if (!file?.buffer?.length) throw new Error('Select a file to attach.');
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('Chat attachments can be up to 10 MB.');
  }

  const key = crypto.randomUUID();

  if (isImage(file)) {
    const storedName = `${key}.webp`;
    const thumbnailName = `${key}-thumb.webp`;
    const storedPath = path.join(CHAT_UPLOAD_ROOT, storedName);
    const thumbnailPath = path.join(CHAT_UPLOAD_ROOT, thumbnailName);

    try {
      const image = sharp(file.buffer, { failOn: 'error' }).rotate();
      await image
        .clone()
        .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toFile(storedPath);
      await image
        .clone()
        .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 72, effort: 3 })
        .toFile(thumbnailPath);
    } catch (_error) {
      await Promise.all([
        fs.promises.unlink(storedPath).catch(() => {}),
        fs.promises.unlink(thumbnailPath).catch(() => {}),
      ]);
      throw new Error('The selected image is invalid or unsupported.');
    }

    const stats = await fs.promises.stat(storedPath);
    return {
      storedName,
      thumbnailName,
      mimeType: 'image/webp',
      sizeBytes: stats.size,
    };
  }

  const requestedMime = String(file.mimetype || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  const audioType = AUDIO_TYPES.get(requestedMime);
  if (audioType) {
    assertAudioSignature(file.buffer, audioType.signature);
    const storedName = `${key}${audioType.extension}`;
    await fs.promises.writeFile(path.join(CHAT_UPLOAD_ROOT, storedName), file.buffer, {
      flag: 'wx',
      mode: 0o600,
    });
    return {
      storedName,
      thumbnailName: null,
      mimeType: requestedMime === 'audio/x-m4a' ? 'audio/mp4' : requestedMime,
      sizeBytes: file.buffer.length,
    };
  }

  const extension = path.extname(String(file.originalname || '')).toLowerCase();
  const fallbackMimeByExtension = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  const effectiveMime = DOCUMENT_TYPES.has(requestedMime)
    ? requestedMime
    : fallbackMimeByExtension[extension];
  const documentType = DOCUMENT_TYPES.get(effectiveMime);
  if (!documentType) {
    throw new Error('Only voice messages, JPG, PNG, WebP, PDF, DOCX and XLSX files are supported.');
  }
  assertDocumentSignature(file.buffer, documentType.signature);

  const storedName = `${key}${documentType.extension}`;
  await fs.promises.writeFile(path.join(CHAT_UPLOAD_ROOT, storedName), file.buffer, {
    flag: 'wx',
    mode: 0o600,
  });
  return {
    storedName,
    thumbnailName: null,
    mimeType: effectiveMime,
    sizeBytes: file.buffer.length,
  };
};

const removeStoredChatAttachment = async ({ storedName, thumbnailName } = {}) => {
  await Promise.all(
    [storedName, thumbnailName]
      .filter(Boolean)
      .map((name) => fs.promises.unlink(path.join(CHAT_UPLOAD_ROOT, path.basename(name))).catch(() => {}))
  );
};

const resolveChatAttachmentPath = (attachment, thumbnail = false) => {
  const selectedName =
    thumbnail && attachment.thumbnail_name
      ? attachment.thumbnail_name
      : attachment.stored_name;
  if (!selectedName || path.basename(selectedName) !== selectedName) return null;

  const resolved = path.join(CHAT_UPLOAD_ROOT, selectedName);
  if (!resolved.startsWith(`${CHAT_UPLOAD_ROOT}${path.sep}`)) return null;
  return resolved;
};

module.exports = {
  MAX_ATTACHMENT_BYTES,
  storeChatAttachment,
  removeStoredChatAttachment,
  resolveChatAttachmentPath,
};
