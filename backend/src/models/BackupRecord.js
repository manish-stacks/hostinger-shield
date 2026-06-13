const mongoose = require('mongoose');

const BackupRecordSchema = new mongoose.Schema({
  website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hostingerBackupId: String,
  backupDate: { type: Date, required: true },
  backupType: { type: String, enum: ['full', 'files', 'database', 'auto', 'manual'], default: 'auto' },
  size: Number,
  status: { type: String, enum: ['available', 'downloading', 'downloaded', 'expired', 'error'], default: 'available' },
  localPath: String,
  isHealthy: { type: Boolean, default: true },
  metadata: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

BackupRecordSchema.index({ website: 1, backupDate: -1 });

module.exports = mongoose.model('BackupRecord', BackupRecordSchema);
