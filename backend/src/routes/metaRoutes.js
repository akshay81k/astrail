const express = require('express');
const metaController = require('../controllers/metaController');

const router = express.Router();

router.get('/meta/signals', metaController.getSignals);
router.get('/meta/graph', metaController.getGraph);
router.get('/meta/faults', metaController.getFaults);
router.get('/meta/config', metaController.getConfig);

module.exports = router;
