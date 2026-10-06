const idGen = require('../utils/idGenerator');
const EvalRun = require('../models/EvalRun');
const evalData = require('../data/evaluationData');
const liveHub = require('../sockets/liveHub');
const { AppError } = require('../middleware/errorHandler');

const memoryEvalRuns = new Map();

class EvalService {
  getSummary() {
    return evalData.evaluationSummary;
  }

  getDetectionResults() {
    return evalData.detectionSmap;
  }

  getRootCauseResults() {
    return evalData.rootCauseEval;
  }

  getFalseAlertsResults() {
    return evalData.falseAlertsEval;
  }

  getRobustnessResults() {
    return evalData.robustnessEval;
  }

  getClassificationResults() {
    return evalData.classificationEval;
  }

  getLeadTimeResults() {
    return evalData.leadTimeEval;
  }

  getCalibrationResults() {
    return evalData.calibrationEval;
  }

  getResultsJson() {
    try {
      const fs = require('fs');
      const path = require('path');
      const candidates = [
        path.resolve(__dirname, '../../../frontend/public/results.json'),
        path.resolve(__dirname, '../../../ml/reports/results.json')
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          return JSON.parse(fs.readFileSync(c, 'utf8'));
        }
      }
    } catch (_) {}
    return evalData.evaluationSummary;
  }

  async startRun(suite, params) {
    const runId = idGen.evalRun();
    const runDoc = {
      _id: runId,
      id: runId,
      suite,
      params,
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString()
    };

    memoryEvalRuns.set(runId, runDoc);
    EvalRun.create(runDoc).catch(() => {});

    // Simulate progress in background
    this._simulateEvalProgress(runId, suite);

    return { id: runId, runId, status: 'queued' };
  }

  async getRun(runId) {
    let run = memoryEvalRuns.get(runId);
    if (!run) {
      try {
        const dbRun = await EvalRun.findById(runId).lean();
        if (dbRun) run = { ...dbRun, id: dbRun._id };
      } catch (_) {}
    }

    if (!run) {
      throw new AppError(404, 'NOT_FOUND', `Evaluation run with ID ${runId} not found`);
    }

    return run;
  }

  _simulateEvalProgress(runId, suite) {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 25;
      const run = memoryEvalRuns.get(runId);
      if (!run) {
        clearInterval(interval);
        return;
      }

      run.progress = Math.min(100, progress);
      run.status = progress >= 100 ? 'completed' : 'running';

      if (progress >= 100) {
        run.finishedAt = new Date().toISOString();
        run.results = evalData.rootCauseEval;
        clearInterval(interval);
      }

      memoryEvalRuns.set(runId, run);
      EvalRun.findByIdAndUpdate(runId, run).catch(() => {});
      liveHub.emitGlobal('eval:progress', { runId, suite, progress: run.progress, status: run.status });
    }, 800);
  }
}

module.exports = new EvalService();
