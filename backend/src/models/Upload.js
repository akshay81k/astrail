const mongoose = require('mongoose');

const UploadSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  filename: { type: String, required: true },
  originalName: { type: String },
  path: { type: String, required: true },
  sizeBytes: { type: Number },
  rows: { type: Number },
  timeColumn: {
    name: { type: String },
    format: { type: String },
    irregular: { type: Boolean },
    medianStepSec: { type: Number }
  },
  columns: [
    {
      name: { type: String },
      numeric: { type: Boolean },
      missingPct: { type: Number },
      suggestedChannel: { type: String },
      matchScore: { type: Number }
    }
  ],
  mapping: { type: Map, of: String },
  mode: { type: String, enum: ['full', 'generic'], default: 'generic' },
  warmupSamples: { type: Number, default: 600 },
  warnings: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
}, {
  _id: false,
  timestamps: true
});

module.exports = mongoose.models.Upload || mongoose.model('Upload', UploadSchema);
