const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reportType: { type: String, enum: ['daily', 'weekly', 'monthly', 'custom', 'threat', 'ssl', 'dns', 'inventory', 'restore'], required: true },
  title: String,
  period: { from: Date, to: Date },
  format: { type: String, enum: ['xlsx', 'csv', 'pdf'], default: 'pdf' },
  status: { type: String, enum: ['pending', 'generating', 'ready', 'error'], default: 'pending' },
  filePath: String,
  fileSize: Number,
  downloadCount: { type: Number, default: 0 },
  generatedAt: Date,
  summary: mongoose.Schema.Types.Mixed,
  error: String,
}, { timestamps: true });

module.exports = mongoose.model('Report', ReportSchema);
