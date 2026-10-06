const mongoose = require("mongoose");

const IncidentSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    sessionId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["analyzing", "open", "acknowledged", "dismissed", "closed"],
      default: "open",
      index: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "warning",
    },
    risk: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    openedAtSim: { type: Number, required: true, index: true },
    openedAtTs: { type: String, default: () => new Date().toISOString() },
    closedAtSim: { type: Number },
    closedAtTs: { type: String },

    classification: {
      label: {
        type: String,
        enum: ["noise", "sensor_fault", "subsystem_fault"],
      },
      probs: {
        noise: { type: Number },
        sensor_fault: { type: Number },
        subsystem_fault: { type: Number },
      },
      rulePath: [{ type: String }],
    },

    onset: {
      simTime: { type: Number },
      order: [
        {
          channel: { type: String },
          t: { type: Number },
          z: { type: Number },
        },
      ],
    },

    rankedCauses: [
      {
        hypothesis: { type: String },
        target: { type: String },
        posterior: { type: Number },
        severityEstimate: { type: Number },
        fitCost: { type: Number },
      },
    ],

    confidence: {
      value: { type: Number },
      previous: { type: Number },
      components: {
        posteriorTop1: { type: Number },
        dataQualityFactor: { type: Number },
        detectorAgreement: { type: Number },
      },
      reason: { type: String },
    },

    title: { type: String },
    type: { type: String },
    detectedTime: { type: String },
    detectedDate: { type: String },

    affectedSubsystems: [
      {
        subsystem: { type: String },
        role: { type: String, enum: ["source", "affected", "not_affected"] },
      },
    ],

    propagation: { type: mongoose.Schema.Types.Mixed },
    graph: { type: mongoose.Schema.Types.Mixed },

    contributions: [
      {
        channel: { type: String },
        share: { type: Number },
        zScore: { type: Number },
        observed: { type: Number },
        forecast: { type: Number },
        unit: { type: String },
      },
    ],

    explanation: { type: mongoose.Schema.Types.Mixed },
    evidence: [{ type: String }],

    recommendations: { type: mongoose.Schema.Types.Mixed },

    timeToLimit: {
      channel: { type: String },
      limit: { type: Number },
      etaSec: { type: Number },
      basis: { type: String },
    },

    detection: {
      gruFlag: { type: Boolean, default: true },
      iforestFlag: { type: Boolean, default: true },
      cusumFlag: { type: Boolean, default: false },
      limitAlarmAtSim: { type: Number, default: null },
      leadTimeSec: { type: Number, default: null },
    },

    mode: { type: String, enum: ["full", "generic"], default: "full" },
    diagnosisState: {
      stage: { type: String, default: "initial" },
      fitsCompleted: { type: Number, default: 1 },
      evidenceWindowSec: { type: Number, default: 60 },
      heuristicOnly: { type: Boolean, default: false },
    },

    groundTruth: { type: mongoose.Schema.Types.Mixed, default: null },
    history: [
      {
        action: { type: String },
        note: { type: String },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    notes: [{ type: String }],
  },
  {
    _id: false,
    timestamps: true,
    strict: false,
  },
);

IncidentSchema.index({ sessionId: 1, status: 1 });

module.exports =
  mongoose.models.Incident || mongoose.model("Incident", IncidentSchema);
