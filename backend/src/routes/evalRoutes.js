const express = require('express');
const evalController = require('../controllers/evalController');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');

const router = express.Router();

router.get('/evaluation/summary', evalController.getSummary);
router.get('/evaluation/detection', evalController.getDetection);
router.get('/evaluation/root-cause', evalController.getRootCause);
router.get('/evaluation/false-alerts', evalController.getFalseAlerts);
router.get('/evaluation/robustness', evalController.getRobustness);
router.get('/evaluation/classification', evalController.getClassification);
router.get('/evaluation/lead-time', evalController.getLeadTime);
router.get('/evaluation/calibration', evalController.getCalibration);
router.post('/evaluation/runs', validate(schemas.startEvalRun), evalController.startRun);
router.get('/evaluation/runs/:runId', evalController.getRun);

module.exports = router;
