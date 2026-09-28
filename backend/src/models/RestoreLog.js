const mongoose = require('mongoose');

const RestoreLogSchema = new mongoose.Schema({
  website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  incident: { type: mongoose.Schema.Types.ObjectId, ref: 'IncidentLog' },
  backupId: String,
  backupDate: Date,
  backupSize: Number,
  restoreType: { type: String, enum: ['full', 'files_only', 'database_only'], default: 'full' },
  status: { type: String, enum: ['pending', 'in_progress', 'completed', 'failed'], default: 'pending' },
  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
  verificationStatus: { type: String, enum: ['pending', 'clean', 'still_infected', 'error'] },
  verificationThreatScore: Number,
  error: String,
  notes: String,
}, { timestamps: true });

module.exports = mongoose.model('RestoreLog', RestoreLogSchema);
