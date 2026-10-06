const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || 'localhost',
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/astrial_shm',
  mongoDbName: process.env.MONGO_DB_NAME || 'astrial_shm',

  mlBaseUrl: process.env.ML_BASE_URL || 'http://127.0.0.1:8000',
  mlWsUrl: process.env.ML_WS_URL || 'ws://127.0.0.1:8000/stream?token=dev-key-123',
  mlApiKey: process.env.ML_API_KEY || 'dev-key-123',
  mlTimeoutMs: parseInt(process.env.ML_TIMEOUT_MS, 10) || 5000,

  uploadMaxMb: parseInt(process.env.UPLOAD_MAX_MB, 10) || 50,
  uploadDir: process.env.UPLOAD_DIR || path.resolve(__dirname, '../../uploads'),

  maxStreamFps: parseInt(process.env.MAX_STREAM_FPS, 10) || 5,
  streamReconnectIntervalMs: parseInt(process.env.STREAM_RECONNECT_INTERVAL_MS, 10) || 3000,
  logLevel: process.env.LOG_LEVEL || 'debug'
};

module.exports = config;
