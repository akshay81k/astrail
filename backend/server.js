const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const config = require('./src/config/env');
const { connectDB } = require('./src/config/db');
const liveHub = require('./src/sockets/liveHub');
const logger = require('./src/utils/logger');

const server = http.createServer(app);

// Initialize Socket.IO with CORS settings
const io = new Server(server, {
  cors: {
    origin: [config.clientOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  path: '/socket.io'
});

// Attach LiveHub to Socket.IO instance
liveHub.init(io);

// Start server
async function startServer() {
  await connectDB();

  server.listen(config.port, () => {
    logger.info(`========================================================`);
    logger.info(`🛰️  Initium Spacecraft Health Monitor Backend Gateway`);
    logger.info(`🚀 Server running on http://${config.host}:${config.port}`);
    logger.info(`📡 Public REST API: http://${config.host}:${config.port}${config.apiPrefix}`);
    logger.info(`⚡ Socket.IO Live Namespace: http://${config.host}:${config.port}/live`);
    logger.info(`🐍 Python ML Target: ${config.mlBaseUrl}`);
    logger.info(`========================================================`);
  });
}

// Graceful shutdown handling
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

startServer().catch(err => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
