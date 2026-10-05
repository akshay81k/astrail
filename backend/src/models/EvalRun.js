const mongoose = require('mongoose');

const EvalRunSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  suite: { type: String, required: true },
  status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'queued' },
  progress: { type: Number, default: 0 },
  params: { type: mongoose.Schema.Types.Mixed },
  results: { type: mongoose.Schema.Types.Mixed },
  error: { type: String },
  createdAt: { type: Date, default: Date.now },
  finishedAt: { type: Date }
}, {
  _id: false,
  timestamps: true
});

EvalRunSchema.index({ suite: 1, createdAt: -1 });

module.exports = mongoose.models.EvalRun || mongoose.model('EvalRun', EvalRunSchema);
