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

    affectedSubsystems: [
      {
        subsystem: { type: String },
        role: { type: String, enum: ["source", "affected", "not_affected"] },
      },
    ],

    propagation: [
      {
        t: { type: Number },
        channel: { type: String },
        event: { type: String },
      },
    ],

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

    explanation: {
      headline: { type: String },
      evidence: { type: String },
      causeConfidence: { type: String },
      action: { type: String },
    },

    recommendations: [
      {
        rank: { type: Number },
        action: { type: String },
        rationale: { type: String },
        safetyChecks: [
          {
            rule: { type: String },
            passed: { type: Boolean },
          },
        ],
      },
    ],

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
  },
);

IncidentSchema.index({ sessionId: 1, status: 1 });

module.exports =
  mongoose.models.Incident || mongoose.model("Incident", IncidentSchema);
