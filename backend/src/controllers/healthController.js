const { getDBStatus } = require('../config/db');
const mlClient = require('../services/mlClient');

async function getHealth(req, res, next) {
  try {
    const mlHealth = await mlClient.getHealth();
    const dbStatus = getDBStatus();

    res.json({
      status: 'ok',
      node: 'up',
      mongo: dbStatus,
      ml: mlHealth.status,
      modelsLoaded: mlHealth.status === 'up' ? (mlHealth.modelsLoaded ?? true) : false,
      version: '1.0.0'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getHealth
};
