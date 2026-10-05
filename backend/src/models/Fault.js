const mongoose = require('mongoose');

const FaultSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sessionId: { type: String, required: true, index: true },
  type: { type: String, required: true },
  target: { type: String },
  severity: { type: Number, required: true },
  startSimTime: { type: Number, required: true },
  rampSec: { type: Number, default: 0 },
  durationSec: { type: Number },
  status: { type: String, enum: ['scheduled', 'active', 'cleared', 'cancelled'], default: 'scheduled' },
  truthHidden: { type: Boolean, default: true },
  truth: {
    trueAffected: [{ type: String }],
    onsetSimTime: { type: Number },
    linkedIncidentId: { type: String },
    outcome: {
      top1Correct: { type: Boolean },
      inTop3: { type: Boolean },
      severityErrorPct: { type: Number },
      detectionDelaySec: { type: Number }
    }
  },
  createdAt: { type: Date, default: Date.now }
}, {
  _id: false,
  timestamps: true
});

module.exports = mongoose.models.Fault || mongoose.model('Fault', FaultSchema);
