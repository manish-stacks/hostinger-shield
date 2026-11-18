const mongoose = require('mongoose');

const HEALTH_TTL_DAYS = Math.max(1, parseInt(process.env.RETAIN_HEALTH_DAYS) || 7);

const WebsiteHealthSchema = new mongoose.Schema({
  website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true, index: true },
  checkedAt: { type: Date, default: Date.now },
  httpStatus: Number,
  httpsStatus: Number,
  responseTime: Number,
  finalUrl: String,
  hasRedirect: Boolean,
  hasRedirectIssue: Boolean,
  redirectChain: [String],
  isUp: Boolean,
  isSlow: Boolean,
  dnsResolved: Boolean,
  ipAddress: String,
  sslValid: Boolean,
  sslExpiry: Date,
  error: String,
}, { timestamps: false });

// Compound index for efficient per-website queries
WebsiteHealthSchema.index({ website: 1, checkedAt: -1 });

// TTL index — automatically expires old health logs in MongoDB
WebsiteHealthSchema.index({ checkedAt: 1 }, { expireAfterSeconds: HEALTH_TTL_DAYS * 24 * 3600 });

module.exports = mongoose.model('WebsiteHealth', WebsiteHealthSchema);
