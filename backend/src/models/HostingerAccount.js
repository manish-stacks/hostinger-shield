const mongoose = require('mongoose');

const HostingerAccountSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accountName: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  apiToken: { type: String, required: true, select: false },
  notes: String,
  isActive: { type: Boolean, default: true },
  lastSync: Date,
  lastValidated: Date,
  isTokenValid: { type: Boolean, default: true },
  tokenValidationError: String,
  websiteCount: { type: Number, default: 0 },
  syncStatus: { type: String, enum: ['idle', 'syncing', 'error', 'success'], default: 'idle' },
  syncError: String,
  color: { type: String, default: '#4f8fff' },
}, { timestamps: true });

module.exports = mongoose.model('HostingerAccount', HostingerAccountSchema);
