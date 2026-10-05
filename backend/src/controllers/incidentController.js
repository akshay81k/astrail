const incidentService = require('../services/incidentService');

async function listIncidents(req, res, next) {
  try {
    const result = await incidentService.listIncidents(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getIncident(req, res, next) {
  try {
    const incident = await incidentService.getIncident(req.params.id);
    res.json(incident);
  } catch (err) {
    next(err);
  }
}

async function acknowledgeIncident(req, res, next) {
  try {
    const updated = await incidentService.acknowledgeIncident(req.params.id, req.body.note);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function dismissIncident(req, res, next) {
  try {
    const updated = await incidentService.dismissIncident(req.params.id, req.body.note);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function closeIncident(req, res, next) {
  try {
    const updated = await incidentService.closeIncident(req.params.id, req.body.note);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function getIncidentReport(req, res, next) {
  try {
    const format = req.query.format || 'json';
    const report = await incidentService.generateReport(req.params.id, format);

    if (format === 'md') {
      res.setHeader('Content-Type', 'text/markdown');
      return res.send(report);
    }

    res.json(report);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listIncidents,
  getIncident,
  acknowledgeIncident,
  dismissIncident,
  closeIncident,
  getIncidentReport
};
