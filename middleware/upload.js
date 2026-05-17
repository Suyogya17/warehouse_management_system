const multer = require("multer");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },

  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

const uploadMiddleware = (fieldName) => {
  return upload.single(fieldName);
};

module.exports = { uploadMiddleware };

// const multer = require("multer");
// const path = require("path");
// const sharp = require("sharp");
// const fs = require("fs");

// const maxSize = 2* 1024 * 1024; // 2MB raw upload limit (sharp will compress it down)

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "uploads/");
//   },
//   filename: (req, file, cb) => {
//     cb(null, Date.now() + path.extname(file.originalname));
//   },
// });

// const imageFileFilter = (req, file, cb) => {
//   if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
//     return cb(new Error("File format not supported."), false);
//   }
//   cb(null, true);
// };

// const uploadMiddleware = multer({
//   storage,
//   fileFilter: imageFileFilter,
//   limits: { fileSize: maxSize },
// });

// // ─── COMPRESS AFTER UPLOAD ────────────────────────
// // Use this as a second middleware after uploadMiddleware.single(...)
// // It resizes to max 800px wide and compresses to ~80% quality JPEG.
// // The original oversized file is deleted and replaced with the compressed one.

// const compressImage = async (req, res, next) => {
//   if (!req.file) return next();

//   const filePath = req.file.path;
//   const compressedPath = filePath + "_compressed.jpg";

//   try {
//     await sharp(filePath)
//       .resize(800, 800, { fit: "inside", withoutEnlargement: true })
//       .jpeg({ quality: 80 })
//       .toFile(compressedPath);

//     // Replace original with compressed
//     fs.unlinkSync(filePath);
//     fs.renameSync(compressedPath, filePath);

//     // Update mimetype so the rest of the app knows it's a jpeg
//     req.file.mimetype = "image/jpeg";

//     next();
//   } catch (err) {
//     next(err);
//   }
// };

// module.exports = uploadMiddleware;
// module.exports.uploadMiddleware = uploadMiddleware;
// module.exports.compressImage = compressImage;
