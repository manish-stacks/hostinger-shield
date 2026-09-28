const mongoose = require('mongoose');

const WebsiteHealthSchema = new mongoose.Schema({
  website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true, index: true },
  // ⚠️  No "index: true" here — index is declared below via schema.index()
  //     to avoid duplicate index warning with the TTL index.
  checkedAt: { type: Date, default: Date.now },
  httpStatus: Number,
  httpsStatus: Number,
  responseTime: Number,
  finalUrl: String,
  hasRedirect: Boolean,
  redirectChain: [String],
  isUp: Boolean,
  isSlow: Boolean,
  dnsResolved: Boolean,
  sslValid: Boolean,
  sslExpiry: Date,
  error: String,
}, { timestamps: false });

// Compound index for efficient per-website queries
WebsiteHealthSchema.index({ website: 1, checkedAt: -1 });

// TTL index — also covers queries on checkedAt alone (replaces the bare { checkedAt: 1 } index)
WebsiteHealthSchema.index({ checkedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports = mongoose.model('WebsiteHealth', WebsiteHealthSchema);
