const express = require('express');
const incidentController = require('../controllers/incidentController');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');

const router = express.Router();

router.get('/incidents', incidentController.listIncidents);
router.get('/incidents/:id', incidentController.getIncident);
router.post('/incidents/:id/acknowledge', validate(schemas.incidentAction), incidentController.acknowledgeIncident);
router.post('/incidents/:id/dismiss', validate(schemas.incidentAction), incidentController.dismissIncident);
router.post('/incidents/:id/close', validate(schemas.incidentAction), incidentController.closeIncident);
router.get('/incidents/:id/report', incidentController.getIncidentReport);

module.exports = router;
