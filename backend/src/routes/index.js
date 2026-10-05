const express = require('express');
const healthRoutes = require('./healthRoutes');
const metaRoutes = require('./metaRoutes');
const scenarioRoutes = require('./scenarioRoutes');
const sessionRoutes = require('./sessionRoutes');
const incidentRoutes = require('./incidentRoutes');
const uploadRoutes = require('./uploadRoutes');
const evalRoutes = require('./evalRoutes');

const router = express.Router();

router.use(healthRoutes);
router.use(metaRoutes);
router.use(scenarioRoutes);
router.use(sessionRoutes);
router.use(incidentRoutes);
router.use(uploadRoutes);
router.use(evalRoutes);

module.exports = router;
