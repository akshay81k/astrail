const sessionService = require('../services/sessionService');

async function createSession(req, res, next) {
  try {
    const session = await sessionService.createSession(req.body);
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
}

async function listSessions(req, res, next) {
  try {
    const sessions = await sessionService.listSessions();
    res.json({
      data: sessions,
      meta: {
        count: sessions.length
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getSession(req, res, next) {
  try {
    const session = await sessionService.getSession(req.params.id);
    res.json(session);
  } catch (err) {
    next(err);
  }
}

async function deleteSession(req, res, next) {
  try {
    await sessionService.deleteSession(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function controlSession(req, res, next) {
  try {
    const state = await sessionService.controlSession(req.params.id, req.body);
    res.json(state);
  } catch (err) {
    next(err);
  }
}

async function getSessionState(req, res, next) {
  try {
    const state = await sessionService.getSessionState(req.params.id);
    res.json(state);
  } catch (err) {
    next(err);
  }
}

async function getSessionTelemetry(req, res, next) {
  try {
    const telemetry = await sessionService.getTelemetryHistory(req.params.id, req.query);
    res.json(telemetry);
  } catch (err) {
    next(err);
  }
}

async function getSessionOrbit(req, res, next) {
  try {
    const orbit = await sessionService.getOrbitData(req.params.id);
    res.json(orbit);
  } catch (err) {
    next(err);
  }
}

async function getSessionAnomalies(req, res, next) {
  try {
    const anomalies = await sessionService.getAnomalies(req.params.id);
    res.json(anomalies);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createSession,
  listSessions,
  getSession,
  deleteSession,
  controlSession,
  getSessionState,
  getSessionTelemetry,
  getSessionOrbit,
  getSessionAnomalies
};
