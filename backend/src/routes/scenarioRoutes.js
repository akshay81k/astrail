const express = require('express');
const scenarioController = require('../controllers/scenarioController');

const router = express.Router();

router.get('/scenarios', scenarioController.listScenarios);
router.post('/sessions/:id/scenarios/:scenarioId/run', scenarioController.runScenario);

module.exports = router;
