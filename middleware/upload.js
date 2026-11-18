const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");

const uploadsDirectory = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadsDirectory, { recursive: true });

const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const MAX_UPLOAD_BYTES = Math.max(
  1024 * 1024,
  Number(process.env.MAX_PUBLIC_UPLOAD_BYTES || 50 * 1024 * 1024)
);

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
    const mediaType = String(file.mimetype || "").toLowerCase();
    const extension =
      mediaType === "video/mp4"
        ? ".mp4"
        : mediaType === "video/webm"
          ? ".webm"
          : path.extname(file.originalname).toLowerCase();
    callback(
      null,
      `${Date.now()}-${crypto.randomUUID()}-${safeBaseName(file.originalname)}${extension}`
    );
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const mediaType = String(file.mimetype || "").toLowerCase();
    const isImage = ALLOWED_IMAGE_TYPES.has(mediaType);
    const isVideo = ALLOWED_VIDEO_TYPES.has(mediaType);
    callback(
      isImage || isVideo
        ? null
        : new Error("Only image or video uploads are supported."),
      isImage || isVideo
    );
  },
});

const hasValidVideoSignature = (buffer, mimetype) => {
  if (mimetype === "video/webm") {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    );
  }

  if (mimetype === "video/mp4") {
    return buffer.length >= 12 && buffer.subarray(4, 8).toString() === "ftyp";
  }

  return false;
};

const validateUploadedVideo = async (file) => {
  const handle = await fs.promises.open(file.path, "r");
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (!hasValidVideoSignature(header.subarray(0, bytesRead), file.mimetype)) {
      throw new Error("The selected video is invalid or unsupported.");
    }
  } finally {
    await handle.close();
  }
};

const optimizeUploadedImage = async (file) => {
  if (!file || !String(file.mimetype || "").startsWith("image/")) return file;

  const filenameBase = path.basename(
    file.filename,
    path.extname(file.filename)
  );
  const optimizedFilename = `${filenameBase}.avif`;
  const optimizedPath = path.join(uploadsDirectory, optimizedFilename);
  const temporaryPath = path.join(
    uploadsDirectory,
    `.${filenameBase}-${process.pid}-${Date.now()}.tmp.avif`
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
      .avif({ quality: 58, effort: 4, chromaSubsampling: "4:2:0" })
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
      mimetype: "image/avif",
      size: stats.size,
    };
  } catch (error) {
    await fs.promises.unlink(temporaryPath).catch(() => {});
    await fs.promises.unlink(file.path).catch(() => {});
    throw new Error(`Image optimization failed: ${error.message}`);
  }
};

const uploadMiddleware = (fieldName) => (req, res, next) => {
  upload.single(fieldName)(req, res, async (uploadError) => {
    if (uploadError) return next(uploadError);
    if (!req.file) return next();

    try {
      if (String(req.file.mimetype || "").startsWith("video/")) {
        await validateUploadedVideo(req.file);
      } else {
        req.file = await optimizeUploadedImage(req.file);
      }
      return next();
    } catch (error) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      error.statusCode = 400;
      return next(error);
    }
  });
};

module.exports = {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  hasValidVideoSignature,
  uploadMiddleware,
  optimizeUploadedImage,
};
