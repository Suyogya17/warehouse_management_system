const fs = require("fs");
const path = require("path");
const multer = require("multer");
const sharp = require("sharp");

const uploadsDirectory = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadsDirectory, { recursive: true });

const safeBaseName = (fileName = "upload") =>
  path
    .basename(fileName, path.extname(fileName))
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "upload";

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadsDirectory);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(
      null,
      `${Date.now()}-${safeBaseName(file.originalname)}${extension}`
    );
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const isImage = String(file.mimetype || "").startsWith("image/");
    const isVideo = String(file.mimetype || "").startsWith("video/");
    callback(
      isImage || isVideo
        ? null
        : new Error("Only image or video uploads are supported."),
      isImage || isVideo
    );
  },
});

const optimizeUploadedImage = async (file) => {
  if (!file || !String(file.mimetype || "").startsWith("image/")) return file;

  const filenameBase = path.basename(
    file.filename,
    path.extname(file.filename)
  );
  const optimizedFilename = `${filenameBase}.webp`;
  const optimizedPath = path.join(uploadsDirectory, optimizedFilename);
  const temporaryPath = path.join(
    uploadsDirectory,
    `.${filenameBase}-${process.pid}-${Date.now()}.tmp.webp`
  );

  try {
    await sharp(file.path)
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 78, effort: 4, smartSubsample: true })
      .toFile(temporaryPath);

    // The original upload may already be WebP, making its final optimized
    // path identical to its input path. Sharp cannot read and write the same
    // file, so always render to a temporary file and replace it only after
    // processing has completed.
    await fs.promises.rename(temporaryPath, optimizedPath);

    if (path.resolve(optimizedPath) !== path.resolve(file.path)) {
      await fs.promises.unlink(file.path).catch(() => {});
    }

    const stats = await fs.promises.stat(optimizedPath);
    return {
      ...file,
      filename: optimizedFilename,
      path: optimizedPath,
      destination: uploadsDirectory,
      mimetype: "image/webp",
      size: stats.size,
    };
  } catch (error) {
    await fs.promises.unlink(temporaryPath).catch(() => {});
    throw new Error(`Image optimization failed: ${error.message}`);
  }
};

const uploadMiddleware = (fieldName) => (req, res, next) => {
  upload.single(fieldName)(req, res, async (uploadError) => {
    if (uploadError) return next(uploadError);
    if (!req.file) return next();

    try {
      req.file = await optimizeUploadedImage(req.file);
      return next();
    } catch (error) {
      return next(error);
    }
  });
};

module.exports = { uploadMiddleware, optimizeUploadedImage };
