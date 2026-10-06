const config = require('../config/env');

const levels = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = levels[config.logLevel.toLowerCase()] || 0;

const logger = {
  debug: (...args) => {
    if (currentLevel <= levels.debug) console.log(`[DEBUG] [${new Date().toISOString()}]`, ...args);
  },
  info: (...args) => {
    if (currentLevel <= levels.info) console.log(`[INFO]  [${new Date().toISOString()}]`, ...args);
  },
  warn: (...args) => {
    if (currentLevel <= levels.warn) console.warn(`[WARN]  [${new Date().toISOString()}]`, ...args);
  },
  error: (...args) => {
    if (currentLevel <= levels.error) console.error(`[ERROR] [${new Date().toISOString()}]`, ...args);
  }
};

module.exports = logger;
