const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { query, pool } = require('../config/db');
const { hasTable } = require('../utils/schemaSupport');

const APPLY = process.argv.includes('--apply');
const DELETE_ORIGINALS = process.argv.includes('--delete-originals');
const chatUploadRoot = path.resolve(
  String(process.env.CHAT_UPLOAD_DIR || '').trim() ||
    path.join(__dirname, '..', 'private_uploads', 'chat')
);

const resolveStoredPath = (name) => {
  if (!name || path.basename(name) !== name) return null;
  const resolved = path.resolve(chatUploadRoot, name);
  return resolved.startsWith(`${chatUploadRoot}${path.sep}`) ? resolved : null;
};

const avifNameFor = (name) =>
  `${path.basename(name, path.extname(name))}.avif`;

const convertFile = async (sourceName, { thumbnail = false } = {}) => {
  if (!sourceName) return { sourceName: null, outputName: null, changed: false };
  if (path.extname(sourceName).toLowerCase() === '.avif') {
    return { sourceName, outputName: sourceName, changed: false };
  }

  const sourcePath = resolveStoredPath(sourceName);
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`Missing chat image: ${sourceName}`);
  }

  const outputName = avifNameFor(sourceName);
  const outputPath = resolveStoredPath(outputName);
  if (!APPLY) return { sourceName, outputName, changed: true };

  if (!fs.existsSync(outputPath)) {
    await sharp(sourcePath, { failOn: 'error' })
      .rotate()
      .resize({
        width: thumbnail ? 480 : 1800,
        height: thumbnail ? 480 : 1800,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .avif({
        quality: thumbnail ? 52 : 60,
        effort: thumbnail ? 3 : 4,
        chromaSubsampling: '4:2:0',
      })
      .toFile(outputPath);
  }

  return { sourceName, outputName, sourcePath, outputPath, changed: true };
};

const main = async () => {
  if (!(await hasTable('chat_attachments'))) {
    console.log('chat_attachments does not exist; nothing to convert.');
    return;
  }

  const rows = await query(
    `SELECT id, stored_name, thumbnail_name, mime_type
     FROM chat_attachments
     WHERE mime_type LIKE 'image/%'
     ORDER BY id`
  );
  const results = [];

  console.log(
    APPLY
      ? `Converting ${rows.length} chat images to AVIF...`
      : `Dry run: ${rows.length} chat images found.`
  );

  for (const row of rows) {
    try {
      const stored = await convertFile(row.stored_name);
      const thumbnail = await convertFile(row.thumbnail_name, { thumbnail: true });

      if (APPLY && (stored.changed || thumbnail.changed)) {
        await query(
          `UPDATE chat_attachments
           SET stored_name = ?, thumbnail_name = ?, mime_type = 'image/avif'
           WHERE id = ?`,
          [stored.outputName, thumbnail.outputName, row.id]
        );

        if (DELETE_ORIGINALS) {
          await Promise.all(
            [stored, thumbnail]
              .filter((file) => file.changed && file.sourcePath !== file.outputPath)
              .map((file) => fs.promises.unlink(file.sourcePath).catch(() => {}))
          );
        }
      }

      results.push({ id: row.id, status: stored.changed || thumbnail.changed ? 'converted' : 'already-avif' });
    } catch (error) {
      results.push({ id: row.id, status: 'error', message: error.message });
      console.error(`error: chat attachment ${row.id}: ${error.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? 'apply' : 'dry-run',
        chat_images: rows.length,
        originals_deleted: APPLY && DELETE_ORIGINALS,
        status_counts: results.reduce((counts, result) => {
          counts[result.status] = Number(counts[result.status] || 0) + 1;
          return counts;
        }, {}),
      },
      null,
      2
    )
  );

  if (!APPLY) {
    console.log('No files or database rows were changed. Back up the database and private chat uploads before using --apply.');
  }
};

main()
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
