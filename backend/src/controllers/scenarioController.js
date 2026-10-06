const scenarios = require('../data/scenarios');
const sessionService = require('../services/sessionService');
const { AppError } = require('../middleware/errorHandler');

function listScenarios(req, res) {
  res.json({
    data: scenarios,
    meta: {
      count: scenarios.length
    }
  });
}

async function runScenario(req, res, next) {
  try {
    const { id, scenarioId } = req.params;
    const scenario = scenarios.find(s => s.id === scenarioId);

    if (!scenario) {
      throw new AppError(404, 'NOT_FOUND', `Scenario '${scenarioId}' not found`);
    }

    // Apply scenario steps
    for (const step of scenario.steps) {
      if (step.fault) {
        await sessionService.injectFault(id, {
          ...step.fault,
          startOffsetSec: Math.max(0, step.atSimTime)
        });
      }
      if (step.stress) {
        await sessionService.scheduleDropout(id, {
          channel: step.stress.channel,
          durationSec: step.stress.durationSec,
          startOffsetSec: Math.max(0, step.atSimTime)
        });
      }
    }

    res.json({
      success: true,
      scenarioId,
      name: scenario.name,
      stepsApplied: scenario.steps.length
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listScenarios,
  runScenario
};
