const sessionService = require('../services/sessionService');

async function injectFault(req, res, next) {
  try {
    const fault = await sessionService.injectFault(req.params.id, req.body);
    res.status(201).json(fault);
  } catch (err) {
    next(err);
  }
}

async function injectRandomFault(req, res, next) {
  try {
    const fault = await sessionService.injectRandomFault(req.params.id, req.body);
    res.status(201).json(fault);
  } catch (err) {
    next(err);
  }
}

async function listFaults(req, res, next) {
  try {
    const faults = await sessionService.listFaults(req.params.id);
    res.json({
      data: faults,
      meta: {
        count: faults.length
      }
    });
  } catch (err) {
    next(err);
  }
}

async function cancelFault(req, res, next) {
  try {
    const result = await sessionService.cancelFault(req.params.id, req.params.faultId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getFaultTruth(req, res, next) {
  try {
    const force = req.query.force === 'true';
    const truth = await sessionService.getFaultTruth(req.params.id, req.params.faultId, force);
    res.json(truth);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  injectFault,
  injectRandomFault,
  listFaults,
  cancelFault,
  getFaultTruth
};
