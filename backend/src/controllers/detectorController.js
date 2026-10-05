const sessionService = require('../services/sessionService');

async function getDetectorSettings(req, res, next) {
  try {
    const session = await sessionService.getSession(req.params.id);
    res.json({
      sessionId: session.id,
      detector: session.detector,
      calibration: {
        thresholds: { sunlight: 2.1, eclipse: 2.6 },
        calibratedAt: new Date().toISOString(),
        measuredSampleRate: 0.0094,
        measuredEpisodesPerDay: 0.78
      }
    });
  } catch (err) {
    next(err);
  }
}

async function updateDetectorSettings(req, res, next) {
  try {
    const result = await sessionService.updateDetector(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDetectorSettings,
  updateDetectorSettings
};
