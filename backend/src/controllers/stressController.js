const sessionService = require('../services/sessionService');

async function setStress(req, res, next) {
  try {
    const stress = await sessionService.setStress(req.params.id, req.body);
    res.json(stress);
  } catch (err) {
    next(err);
  }
}

async function getStress(req, res, next) {
  try {
    const session = await sessionService.getSession(req.params.id);
    const bridge = require('../services/streamBridge').getBridge(req.params.id);
    res.json(bridge ? bridge.mockSim.stress : (session.stress || {}));
  } catch (err) {
    next(err);
  }
}

async function scheduleDropout(req, res, next) {
  try {
    const result = await sessionService.scheduleDropout(req.params.id, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function getSensors(req, res, next) {
  try {
    const state = await sessionService.getSessionState(req.params.id);
    res.json({
      data: state.sensors,
      meta: {
        count: state.sensors.length
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  setStress,
  getStress,
  scheduleDropout,
  getSensors
};
