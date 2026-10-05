const dns = require('dns');
const mongoose = require('mongoose');
const config = require('./env');

// Configure reliable DNS servers for MongoDB Atlas SRV record resolution
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (_) {}

let isConnected = false;

async function connectDB() {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(config.mongoUri, {
      dbName: config.mongoDbName || 'astrial_shm',
      serverSelectionTimeoutMS: 8000,
    });
    isConnected = true;
    console.log(`[DB] Connected successfully to MongoDB Atlas database "${config.mongoDbName || 'astrial_shm'}"`);
  } catch (err) {
    isConnected = false;
    console.warn(`[DB] Warning: MongoDB not reachable at ${config.mongoUri}. Error: ${err.message}. Backend will use in-memory store for development/demo.`);
  }
}

mongoose.connection.on('connected', () => {
  isConnected = true;
  console.log('[DB] MongoDB connection established');
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('[DB] MongoDB disconnected');
});

function isDBConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

function getDBStatus() {
  return isDBConnected() ? 'up' : 'down';
}

module.exports = {
  connectDB,
  getDBStatus,
  isDBConnected,
  mongoose
};
