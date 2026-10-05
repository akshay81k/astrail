const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');
const { AppError } = require('./errorHandler');

if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.csv';
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    cb(null, `upload_${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.csv' || file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
    cb(null, true);
  } else {
    cb(new AppError(415, 'UNSUPPORTED_FILE', 'Only CSV files are supported (.csv)'), false);
  }
};

const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: config.uploadMaxMb * 1024 * 1024
  },
  fileFilter
});

function handleUpload(req, res, next) {
  uploadMiddleware.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, 'UPLOAD_TOO_LARGE', `Uploaded file exceeds limit of ${config.uploadMaxMb}MB`));
      }
      return next(new AppError(400, 'VALIDATION_ERROR', err.message));
    } else if (err) {
      return next(err);
    }
    if (!req.file) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'File is required (form field: "file")'));
    }
    next();
  });
}

module.exports = handleUpload;
