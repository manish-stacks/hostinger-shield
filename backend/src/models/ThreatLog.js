const mongoose = require('mongoose');

const ThreatLogSchema = new mongoose.Schema({
  website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  detectedAt: { type: Date, default: Date.now },
  threatType: {
    type: String,
    enum: [
      'casino_spam', 'gambling_spam', 'pharma_spam', 'japanese_seo_spam',
      'chinese_seo_spam', 'crypto_scam', 'adult_content', 'suspicious_redirect',
      'defacement', 'unexpected_meta', 'unexpected_title', 'suspicious_keywords',
      'malware', 'phishing', 'exposed_env', 'directory_listing', 'debug_mode',
      'file_modified', 'file_deleted', 'new_file', 'dns_changed', 'ssl_expired',
      'website_down', 'keyword_missing', 'content_changed', 'seo_link_injection', 'korean_spam',
    ],
    required: true,
  },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  score: { type: Number, min: 0, max: 100 },
  title: String,
  description: String,
  evidence: mongoose.Schema.Types.Mixed,
  isResolved: { type: Boolean, default: false },
  resolvedAt: Date,
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolution: String,
}, { timestamps: true });

ThreatLogSchema.index({ website: 1, detectedAt: -1 });

module.exports = mongoose.model('ThreatLog', ThreatLogSchema);
