const mongoose = require('mongoose');

const WebsiteSchema = new mongoose.Schema({
  hostingerAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'HostingerAccount', default: null },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  domain: { type: String, required: true, lowercase: true, trim: true },

  // Server / grouping metadata (supports non-Hostinger servers too)
  serverName: { type: String, trim: true },
  ipAddress: String,

  // Hostinger API synced fields
  hostingUsername: String,
  hostingPlan: String,
  orderId: Number,
  subscriptionId: String,
  vhostType: { type: String, enum: ['main', 'addon', 'parked', 'subdomain'], default: 'main' },
  isEnabled: { type: Boolean, default: true },
  hostingClientId: Number,

  // Expiry dates
  hostingExpiry: Date,
  domainExpiry: Date,

  // Monitoring & health
  status: { type: String, enum: ['healthy', 'warning', 'hacked', 'down', 'critical', 'restoring', 'unknown'], default: 'unknown' },
  threatScore: { type: Number, default: 0, min: 0, max: 100 },
  threatLevel: { type: String, enum: ['safe', 'warning', 'high_risk', 'critical'], default: 'safe' },
  sslStatus: { type: String, enum: ['valid', 'expiring', 'expired', 'invalid', 'none', 'unknown'], default: 'unknown' },
  sslExpiry: Date,
  sslDaysLeft: Number,
  isMonitoringEnabled: { type: Boolean, default: true },
  monitoringInterval: { type: Number, default: 5 },
  lastHealthCheck: Date,
  lastThreatScan: Date,
  lastScreenshot: Date,
  lastBackup: Date,
  lastRestoreDate: Date,
  lastSync: Date,
  httpStatus: Number,
  responseTime: Number,
  finalUrl: String,
  hasRedirect: { type: Boolean, default: false },
  lastError: String,
  downSince: Date,
  consecutiveFailures: { type: Number, default: 0 },
  uptime24h: { type: Number, default: null },
  lastDownAlertAt: Date,
  alertEmail: String,
  alertPhone: String,
  technology: {
    cms: String,
    framework: String,
    server: String,
    language: String,
    ecommerce: String,
    detected: [String],
  },
  expectedKeywords: [String],
  contentBaseline: {
    title: String,
    metaDescription: String,
    keywords: [String],
    capturedAt: Date,
  },
  lastHealthSave: Date,
  wpBaseline: mongoose.Schema.Types.Mixed,
  threatAllowlist: [String],
  isBaselinesSet: { type: Boolean, default: false },
  notes: String,
  tags: [String],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

WebsiteSchema.index({ domain: 1, hostingerAccount: 1 }, { unique: true });
WebsiteSchema.index({ domain: 1, user: 1 });
WebsiteSchema.index({ status: 1, user: 1 });
WebsiteSchema.index({ threatScore: -1 });

module.exports = mongoose.model('Website', WebsiteSchema);
