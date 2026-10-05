const incidentService = require('../services/incidentService');

async function getComparison(req, res, next) {
  try {
    const comparison = await incidentService.getComparison(req.params.id);
    res.json(comparison);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getComparison
};
