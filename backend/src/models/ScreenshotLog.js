const mongoose = require('mongoose');

const ScreenshotLogSchema = new mongoose.Schema({
  website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true, index: true },
  capturedAt: { type: Date, default: Date.now },
  screenshotPath: String,
  screenshotUrl: String,
  hasChanged: { type: Boolean, default: false },
  changePercent: Number,
  diffImagePath: String,
  isDefaced: { type: Boolean, default: false },
  pageTitle: String,
  hash: String,
  isEvidence: { type: Boolean, default: false },
  error: String,
}, { timestamps: false });

ScreenshotLogSchema.index({ website: 1, capturedAt: -1 });

module.exports = mongoose.model('ScreenshotLog', ScreenshotLogSchema);
