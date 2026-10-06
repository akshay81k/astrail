const { signals, exogenousInputs } = require('../data/signalCatalog');
const { nodes, edges } = require('../data/dependencyGraph');
const faults = require('../data/faultCatalog');

function getSignals(req, res) {
  res.json({
    data: signals,
    meta: {
      exogenousInputs,
      count: signals.length
    }
  });
}

function getGraph(req, res) {
  res.json({
    data: {
      nodes,
      edges
    },
    meta: {
      nodeCount: nodes.length,
      edgeCount: edges.length
    }
  });
}

function getFaults(req, res) {
  res.json({
    data: faults,
    meta: {
      count: faults.length
    }
  });
}

function getConfig(req, res) {
  res.json({
    data: {
      sampleRateHz: 1,
      windowSec: 60,
      targetFalseAlarmRate: 0.01,
      persistK: 5,
      persistN: 8,
      closeHysteresisSec: 10,
      reorderBufferSec: 15,
      unavailableThresholdSec: 60,
      evidenceWindowSec: 120,
      rcaRefitIntervalSec: 30,
      preFilterCandidates: 4,
      warmupSamples: 600,
      maxVisibleChannels: 6,
      maxStreamFps: 5
    }
  });
}

module.exports = {
  getSignals,
  getGraph,
  getFaults,
  getConfig
};
