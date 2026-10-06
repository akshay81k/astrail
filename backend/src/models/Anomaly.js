const mongoose = require('mongoose');

const AnomalySchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sessionId: { type: String, required: true, index: true },
  episodeId: { type: String, required: true },
  startSim: { type: Number, required: true },
  endSim: { type: Number },
  class: { type: String, enum: ['noise', 'sensor_fault', 'subsystem_fault'], required: true },
  peakScore: { type: Number },
  suppressed: { type: Boolean, default: false },
  features: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
}, {
  _id: false,
  timestamps: true
});

AnomalySchema.index({ sessionId: 1, startSim: 1 });

module.exports = mongoose.models.Anomaly || mongoose.model('Anomaly', AnomalySchema);
