const multer = require('multer');
const { MAX_ATTACHMENT_BYTES } = require('../services/chatAttachmentService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
});

const chatAttachmentUpload = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    error.statusCode = 400;
    if (error.code === 'LIMIT_FILE_SIZE') {
      error.message = 'Chat attachments can be up to 10 MB.';
    }
    return next(error);
  });
};

module.exports = { chatAttachmentUpload };
