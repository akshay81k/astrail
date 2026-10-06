const express = require('express');
const sessionController = require('../controllers/sessionController');
const faultController = require('../controllers/faultController');
const stressController = require('../controllers/stressController');
const detectorController = require('../controllers/detectorController');
const comparisonController = require('../controllers/comparisonController');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');

const router = express.Router();

// 1. Session Core
router.post('/sessions', validate(schemas.createSession), sessionController.createSession);
router.get('/sessions', sessionController.listSessions);
router.get('/sessions/:id', sessionController.getSession);
router.delete('/sessions/:id', sessionController.deleteSession);
router.post('/sessions/:id/control', validate(schemas.controlSession), sessionController.controlSession);
router.get('/sessions/:id/state', sessionController.getSessionState);
router.get('/sessions/:id/telemetry', sessionController.getSessionTelemetry);
router.get('/sessions/:id/orbit', sessionController.getSessionOrbit);
router.get('/sessions/:id/anomalies', sessionController.getSessionAnomalies);

// 2. Fault Injection
router.post('/sessions/:id/faults', validate(schemas.injectFault), faultController.injectFault);
router.post('/sessions/:id/faults/random', validate(schemas.injectRandomFault), faultController.injectRandomFault);
router.get('/sessions/:id/faults', faultController.listFaults);
router.delete('/sessions/:id/faults/:faultId', faultController.cancelFault);
router.get('/sessions/:id/faults/:faultId/truth', faultController.getFaultTruth);

// 3. Stress & Data Quality
router.put('/sessions/:id/stress', validate(schemas.updateStress), stressController.setStress);
router.get('/sessions/:id/stress', stressController.getStress);
router.post('/sessions/:id/stress/dropout', validate(schemas.scheduleDropout), stressController.scheduleDropout);
router.get('/sessions/:id/sensors', stressController.getSensors);

// 4. Comparison
router.get('/sessions/:id/comparison', comparisonController.getComparison);

// 5. Detector Settings
router.get('/sessions/:id/detector', detectorController.getDetectorSettings);
router.patch('/sessions/:id/detector', validate(schemas.updateDetector), detectorController.updateDetectorSettings);

module.exports = router;
