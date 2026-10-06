const axios = require('axios');
const config = require('../config/env');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const { convertKeysToSnake, convertKeysToCamel } = require('../utils/caseConverter');

const axiosInstance = axios.create({
  baseURL: config.mlBaseUrl,
  timeout: config.mlTimeoutMs,
  headers: {
    'Content-Type': 'application/json'
  }
});

class MLClient {
  async getHealth() {
    try {
      const res = await axiosInstance.get('/health');
      return { status: 'up', ...res.data };
    } catch (err) {
      return { status: 'down', error: err.message };
    }
  }

  async createSession(sessionPayload) {
    try {
      const body = convertKeysToSnake(sessionPayload);
      const res = await axiosInstance.post('/sessions', body);
      return convertKeysToCamel(res.data);
    } catch (err) {
      this._handleError(err, 'createSession');
    }
  }

  async controlSession(sessionId, actionPayload) {
    try {
      const body = convertKeysToSnake(actionPayload);
      const res = await axiosInstance.post(`/sessions/${sessionId}/control`, body);
      return convertKeysToCamel(res.data);
    } catch (err) {
      this._handleError(err, 'controlSession');
    }
  }

  async deleteSession(sessionId) {
    try {
      const res = await axiosInstance.delete(`/sessions/${sessionId}`);
      return res.data;
    } catch (err) {
      this._handleError(err, 'deleteSession');
    }
  }

  async setStress(sessionId, stressPayload) {
    try {
      const body = convertKeysToSnake(stressPayload);
      const res = await axiosInstance.put(`/sessions/${sessionId}/stress`, body);
      return convertKeysToCamel(res.data);
    } catch (err) {
      this._handleError(err, 'setStress');
    }
  }

  async scheduleDropout(sessionId, dropoutPayload) {
    try {
      const body = convertKeysToSnake(dropoutPayload);
      const res = await axiosInstance.post(`/sessions/${sessionId}/dropout`, body);
      return convertKeysToCamel(res.data);
    } catch (err) {
      this._handleError(err, 'scheduleDropout');
    }
  }

  async injectFault(sessionId, faultPayload) {
    try {
      const body = convertKeysToSnake(faultPayload);
      const res = await axiosInstance.post(`/sessions/${sessionId}/faults`, body);
      return convertKeysToCamel(res.data);
    } catch (err) {
      this._handleError(err, 'injectFault');
    }
  }

  async injectRandomFault(sessionId, params) {
    try {
      const body = convertKeysToSnake(params);
      const res = await axiosInstance.post(`/sessions/${sessionId}/faults/random`, body);
      return convertKeysToCamel(res.data);
    } catch (err) {
      this._handleError(err, 'injectRandomFault');
    }
  }

  async cancelFault(sessionId, faultId) {
    try {
      const res = await axiosInstance.delete(`/sessions/${sessionId}/faults/${faultId}`);
      return convertKeysToCamel(res.data);
    } catch (err) {
      this._handleError(err, 'cancelFault');
    }
  }

  async getFaultTruth(sessionId, faultId) {
    try {
      const res = await axiosInstance.get(`/sessions/${sessionId}/faults/${faultId}/truth`);
      return convertKeysToCamel(res.data);
    } catch (err) {
      this._handleError(err, 'getFaultTruth');
    }
  }

  async updateDetector(sessionId, params) {
    try {
      const body = convertKeysToSnake(params);
      const res = await axiosInstance.patch(`/sessions/${sessionId}/detector`, body);
      return convertKeysToCamel(res.data);
    } catch (err) {
      this._handleError(err, 'updateDetector');
    }
  }

  async getSessionState(sessionId) {
    try {
      const res = await axiosInstance.get(`/sessions/${sessionId}/state`);
      return convertKeysToCamel(res.data);
    } catch (err) {
      this._handleError(err, 'getSessionState');
    }
  }

  async inspectDataset(filePath) {
    try {
      const res = await axiosInstance.post('/datasets/inspect', { path: filePath });
      return convertKeysToCamel(res.data);
    } catch (err) {
      this._handleError(err, 'inspectDataset');
    }
  }

  async runEvaluation(suite, params) {
    try {
      const body = convertKeysToSnake({ suite, params });
      const res = await axiosInstance.post('/eval/run', body);
      return convertKeysToCamel(res.data);
    } catch (err) {
      this._handleError(err, 'runEvaluation');
    }
  }

  async analyzeAnomaly(flaggedSensors, currentReadings, predictions = {}) {
    try {
      const res = await axiosInstance.post('/analyze', {
        flagged_sensors: flaggedSensors,
        current_readings: currentReadings,
        predictions
      }, {
        headers: { 'X-API-Key': config.mlApiKey || 'dev-key-123' }
      });
      return res.data;
    } catch (err) {
      logger.warn('[MLClient] analyzeAnomaly failed:', err.message);
      return null;
    }
  }

  async ingestBatch(batchId, rows) {
    try {
      const res = await axiosInstance.post('/ingest', {
        batch_id: batchId,
        data: rows
      }, {
        headers: { 'X-API-Key': config.mlApiKey || 'dev-key-123' }
      });
      return res.data;
    } catch (err) {
      logger.warn('[MLClient] ingestBatch failed:', err.message);
      return null;
    }
  }

  _handleError(err, operation) {
    logger.warn(`[MLClient] ${operation} failed:`, err.message);
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      throw new AppError(502, 'ML_UNAVAILABLE', 'Python ML service is currently offline or unreachable');
    }
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      throw new AppError(504, 'ML_TIMEOUT', 'Python ML service request timed out');
    }
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data || {};
      throw new AppError(status, data.error?.code || 'ML_ERROR', data.error?.message || err.message, data.error?.details || []);
    }
    throw new AppError(500, 'INTERNAL_ERROR', err.message);
  }
}

module.exports = new MLClient();
