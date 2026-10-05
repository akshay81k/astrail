const logger = require('../utils/logger');

class AppError extends Error {
  constructor(statusCode, code, message, details = []) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || (statusCode === 500 ? 'INTERNAL_ERROR' : 'ERROR');
  const message = err.message || 'An unexpected error occurred';
  const details = err.details || [];
  const requestId = req.id || 'req_unknown';

  if (statusCode >= 500) {
    logger.error(`[${requestId}] ${req.method} ${req.originalUrl} - ${statusCode}:`, err);
  } else {
    logger.warn(`[${requestId}] ${req.method} ${req.originalUrl} - ${statusCode} ${code}: ${message}`);
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      details,
      requestId
    }
  });
}

module.exports = {
  AppError,
  errorHandler
};
