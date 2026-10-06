const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  source: { type: String, enum: ['simulator', 'smap_msl', 'opssat', 'upload'], default: 'simulator' },
  mode: { type: String, enum: ['full', 'generic'], default: 'full' },
  status: { type: String, enum: ['created', 'playing', 'paused', 'ended'], default: 'created' },
  simTime: { type: Number, default: 0 },
  speed: { type: Number, default: 4 },
  seed: { type: Number, default: 42 },
  mismatchLevel: { type: String, enum: ['none', 'medium', 'high'], default: 'medium' },
  sourceLabel: { type: String },
  channels: [{ type: String }],
  detector: {
    targetFalseAlarmRate: { type: Number, default: 0.01 },
    persistK: { type: Number, default: 5 },
    persistN: { type: Number, default: 8 }
  },
  smap: {
    channelId: { type: String }
  },
  uploadId: { type: String },
  warmup: {
    samples: { type: Number, default: 600 },
    status: { type: String, enum: ['fitting', 'completed', 'failed'] }
  },
  stress: {
    missingPct: { type: Number, default: 0 },
    noiseScale: { type: Number, default: 1.0 },
    delaySec: { type: Number, default: 0 },
    jitterSec: { type: Number, default: 0 },
    outOfOrderPct: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  _id: false,
  timestamps: true
});

module.exports = mongoose.models.Session || mongoose.model('Session', SessionSchema);
