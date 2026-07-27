const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { query, pool } = require("../config/db");
const { hasColumn, hasTable } = require("../utils/schemaSupport");

const APPLY = process.argv.includes("--apply");
const uploadsDirectory = path.resolve(__dirname, "..", "uploads");
const imageReferences = [
  { table: "finished_goods", column: "image_url" },
  { table: "raw_materials", column: "image_url" },
  { table: "advertisements", column: "image_url" },
];

const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
};

const getSupportedReferences = async () => {
  const supported = [];
  for (const reference of imageReferences) {
    if (
      (await hasTable(reference.table)) &&
      (await hasColumn(reference.table, reference.column))
    ) {
      supported.push(reference);
    }
  }
  return supported;
};

const getReferencedUrls = async (references) => {
  const urls = new Set();
  for (const { table, column } of references) {
    const rows = await query(
      `SELECT DISTINCT ${column} AS image_url
       FROM ${table}
       WHERE ${column} IS NOT NULL
         AND ${column} LIKE '/uploads/%'`
    );
    rows.forEach((row) => urls.add(row.image_url));
  }
  return [...urls];
};

const resolveUploadPath = (imageUrl) => {
  const fileName = path.basename(String(imageUrl || ""));
  const filePath = path.resolve(uploadsDirectory, fileName);
  return filePath.startsWith(`${uploadsDirectory}${path.sep}`)
    ? filePath
    : null;
};

const updateReferences = async (references, oldUrl, newUrl) => {
  let updatedRows = 0;
  for (const { table, column } of references) {
    const result = await query(
      `UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`,
      [newUrl, oldUrl]
    );
    updatedRows += Number(result.affectedRows || 0);
  }
  return updatedRows;
};

const optimizeOne = async (imageUrl, references) => {
  const sourcePath = resolveUploadPath(imageUrl);
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return { status: "missing", imageUrl };
  }

  let metadata;
  try {
    metadata = await sharp(sourcePath).metadata();
  } catch {
    return { status: "non-image", imageUrl };
  }

  if (!metadata.width || !metadata.height) {
    return { status: "non-image", imageUrl };
  }

  const sourceStats = await fs.promises.stat(sourcePath);
  const sourceExtension = path.extname(sourcePath).toLowerCase();
  if (
    sourceExtension === ".webp" &&
    sourceStats.size <= 300 * 1024 &&
    metadata.width <= 1200 &&
    metadata.height <= 1200
  ) {
    return { status: "already-optimized", imageUrl };
  }

  const outputName = `${path.basename(
    sourcePath,
    path.extname(sourcePath)
  )}.optimized.webp`;
  const outputPath = path.join(uploadsDirectory, outputName);
  const outputUrl = `/uploads/${outputName}`;

  if (!APPLY) {
    return {
      status: "would-optimize",
      imageUrl,
      sourceSize: sourceStats.size,
      outputUrl,
    };
  }

  if (!fs.existsSync(outputPath)) {
    await sharp(sourcePath)
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 78, effort: 4, smartSubsample: true })
      .toFile(outputPath);
  }

  const outputStats = await fs.promises.stat(outputPath);
  const updatedRows = await updateReferences(
    references,
    imageUrl,
    outputUrl
  );

  return {
    status: "optimized",
    imageUrl,
    outputUrl,
    sourceSize: sourceStats.size,
    outputSize: outputStats.size,
    updatedRows,
  };
};

const main = async () => {
  const references = await getSupportedReferences();
  const urls = await getReferencedUrls(references);
  const results = [];

  console.log(
    APPLY
      ? `Optimizing ${urls.length} referenced uploads...`
      : `Dry run: ${urls.length} referenced uploads found.`
  );

  for (const imageUrl of urls) {
    try {
      const result = await optimizeOne(imageUrl, references);
      results.push(result);
      if (["optimized", "would-optimize"].includes(result.status)) {
        console.log(
          `${result.status}: ${imageUrl} (${formatBytes(
            result.sourceSize
          )}${result.outputSize ? ` -> ${formatBytes(result.outputSize)}` : ""})`
        );
      }
    } catch (error) {
      results.push({ status: "error", imageUrl, message: error.message });
      console.error(`error: ${imageUrl}: ${error.message}`);
    }
  }

  const optimized = results.filter(
    (result) => result.status === "optimized"
  );
  const bytesBefore = optimized.reduce(
    (sum, result) => sum + Number(result.sourceSize || 0),
    0
  );
  const bytesAfter = optimized.reduce(
    (sum, result) => sum + Number(result.outputSize || 0),
    0
  );

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        referenced_files: urls.length,
        optimized_files: optimized.length,
        bytes_before: bytesBefore,
        bytes_after: bytesAfter,
        saved_bytes: Math.max(0, bytesBefore - bytesAfter),
        originals_deleted: false,
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
    console.log(
      "No files or database rows were changed. Run again with --apply after taking a database and uploads backup."
    );
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
