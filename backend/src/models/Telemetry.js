const mongoose = require('mongoose');

const TelemetrySchema = new mongoose.Schema({
  ts: { type: Date, default: Date.now, index: true },
  meta: {
    sessionId: { type: String, required: true, index: true }
  },
  simTime: { type: Number, required: true },
  v: { type: Map, of: Number },       // channel -> value
  q: { type: Map, of: String },       // channel -> status ('ok', 'missing', etc.)
  forecast: { type: Map, of: Number },// channel -> forecast value
  score: { type: Number },
  threshold: { type: Number },
  flag: { type: Number },             // 0 or 1
  regime: { type: String },           // 'sunlight' or 'eclipse'
  limitState: { type: Map, of: String }
}, {
  timestamps: false
});

TelemetrySchema.index({ 'meta.sessionId': 1, simTime: 1 });

module.exports = mongoose.models.Telemetry || mongoose.model('Telemetry', TelemetrySchema);
