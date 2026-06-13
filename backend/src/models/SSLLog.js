const mongoose = require('mongoose');

const SSLLogSchema = new mongoose.Schema({
  website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true, index: true },
  checkedAt: { type: Date, default: Date.now },
  isValid: Boolean,
  issuer: String,
  subject: String,
  validFrom: Date,
  validTo: Date,
  daysUntilExpiry: Number,
  protocol: String,
  cipher: String,
  error: String,
  alertSent: { type: Boolean, default: false },
  alertLevel: { type: String, enum: ['30d', '15d', '7d', '3d', '1d', 'expired'] },
}, { timestamps: false });

SSLLogSchema.index({ website: 1, checkedAt: -1 });

module.exports = mongoose.model('SSLLog', SSLLogSchema);
