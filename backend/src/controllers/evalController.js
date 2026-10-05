const evalService = require('../services/evalService');

function getSummary(req, res) {
  res.json(evalService.getSummary());
}

function getDetection(req, res) {
  res.json(evalService.getDetectionResults());
}

function getRootCause(req, res) {
  res.json(evalService.getRootCauseResults());
}

function getFalseAlerts(req, res) {
  res.json(evalService.getFalseAlertsResults());
}

function getRobustness(req, res) {
  res.json(evalService.getRobustnessResults());
}

function getClassification(req, res) {
  res.json(evalService.getClassificationResults());
}

function getLeadTime(req, res) {
  res.json(evalService.getLeadTimeResults());
}

function getCalibration(req, res) {
  res.json(evalService.getCalibrationResults());
}

async function startRun(req, res, next) {
  try {
    const { suite, params } = req.body;
    const result = await evalService.startRun(suite, params);
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}

async function getRun(req, res, next) {
  try {
    const run = await evalService.getRun(req.params.runId);
    res.json(run);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSummary,
  getDetection,
  getRootCause,
  getFalseAlerts,
  getRobustness,
  getClassification,
  getLeadTime,
  getCalibration,
  startRun,
  getRun
};
