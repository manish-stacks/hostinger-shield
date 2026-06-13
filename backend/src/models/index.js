const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ─── USER ────────────────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['super_admin', 'admin', 'viewer'], default: 'admin' },
  isActive: { type: Boolean, default: true },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String, select: false },
  refreshTokens: [{ token: String, createdAt: Date }],
  passwordResetToken: String,
  passwordResetExpires: Date,
  lastLogin: Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  alertPreferences: {
    whatsapp: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    inApp: { type: Boolean, default: true },
    push: { type: Boolean, default: false },
    phoneNumber: String,
    alertEmail: String,
  },
  avatar: String,
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
UserSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};
UserSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ─── HOSTINGER ACCOUNT ───────────────────────────────────────────────────────
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

// ─── WEBSITE ─────────────────────────────────────────────────────────────────
const WebsiteSchema = new mongoose.Schema({
  hostingerAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'HostingerAccount', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  domain: { type: String, required: true, lowercase: true, trim: true },

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
  status: { type: String, enum: ['healthy', 'warning', 'hacked', 'down', 'critical', 'unknown'], default: 'unknown' },
  threatScore: { type: Number, default: 0, min: 0, max: 100 },
  threatLevel: { type: String, enum: ['safe', 'warning', 'high_risk', 'critical'], default: 'safe' },
  sslStatus: { type: String, enum: ['valid', 'expiring', 'expired', 'invalid', 'none', 'unknown'], default: 'unknown' },
  sslExpiry: Date,
  sslDaysLeft: Number,
  isMonitoringEnabled: { type: Boolean, default: true },
  monitoringInterval: { type: Number, default: 15 },
  lastHealthCheck: Date,
  lastThreatScan: Date,
  lastScreenshot: Date,
  lastBackup: Date,
  lastSync: Date,
  httpStatus: Number,
  responseTime: Number,
  finalUrl: String,
  hasRedirect: { type: Boolean, default: false },
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
  isBaselinesSet: { type: Boolean, default: false },
  notes: String,
  tags: [String],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

WebsiteSchema.index({ domain: 1, hostingerAccount: 1 }, { unique: true });
WebsiteSchema.index({ domain: 1, user: 1 });
WebsiteSchema.index({ status: 1, user: 1 });
WebsiteSchema.index({ threatScore: -1 });
// ─── WEBSITE HEALTH LOG ───────────────────────────────────────────────────────
const WebsiteHealthSchema = new mongoose.Schema({
  website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true, index: true },
  checkedAt: { type: Date, default: Date.now, index: true },
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
WebsiteHealthSchema.index({ website: 1, checkedAt: -1 });
WebsiteHealthSchema.index({ checkedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

// ─── THREAT LOG ───────────────────────────────────────────────────────────────
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
      'website_down', 'keyword_missing', 'content_changed', 'seo_link_injection','korean_spam',
    ],
    required: true
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

// ─── SSL LOG ──────────────────────────────────────────────────────────────────
const SSLLogSchema = new mongoose.Schema({
  website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true, index: true },
  
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

// ─── DNS LOG ──────────────────────────────────────────────────────────────────
const DNSLogSchema = new mongoose.Schema({
  website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true, index: true },
  
  records: {
    A: [String],
    AAAA: [String],
    MX: [String],
    TXT: [String],
    NS: [String],
    CNAME: [String],
  },
  hasChanged: { type: Boolean, default: false },
  changedRecords: mongoose.Schema.Types.Mixed,
  previousRecords: mongoose.Schema.Types.Mixed,
  alertSent: { type: Boolean, default: false },
}, { timestamps: false });
DNSLogSchema.index({ website: 1, checkedAt: -1 });

// ─── SCREENSHOT LOG ───────────────────────────────────────────────────────────
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
  error: String,
}, { timestamps: false });
ScreenshotLogSchema.index({ website: 1, capturedAt: -1 });

// ─── INCIDENT LOG ────────────────────────────────────────────────────────────
const IncidentLogSchema = new mongoose.Schema({
  website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  incidentType: { type: String, required: true },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  title: { type: String, required: true },
  description: String,
  detectionTime: { type: Date, default: Date.now },
  alertTime: Date,
  userActionTime: Date,
  restoreActionTime: Date,
  resolutionTime: Date,
  status: { type: String, enum: ['open', 'acknowledged', 'in_progress', 'resolved', 'closed'], default: 'open' },
  relatedThreats: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ThreatLog' }],
  timeline: [{
    event: String,
    description: String,
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
  }],
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolution: String,
}, { timestamps: true });

// ─── RESTORE LOG ─────────────────────────────────────────────────────────────
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

// ─── NOTIFICATION ────────────────────────────────────────────────────────────
const NotificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website' },
  type: { type: String, enum: ['threat', 'ssl', 'dns', 'down', 'backup', 'restore', 'info', 'warning'], required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  channels: {
    whatsapp: { sent: Boolean, sentAt: Date, error: String },
    email: { sent: Boolean, sentAt: Date, error: String },
    inApp: { sent: Boolean, readAt: Date },
    push: { sent: Boolean, sentAt: Date, error: String },
  },
  isRead: { type: Boolean, default: false },
  readAt: Date,
  actionUrl: String,
}, { timestamps: true });
NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

// ─── REPORT ───────────────────────────────────────────────────────────────────
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

// ─── BACKUP RECORD ────────────────────────────────────────────────────────────
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

// ─── EXPORTS ─────────────────────────────────────────────────────────────────
module.exports = {
  User: mongoose.model('User', UserSchema),
  HostingerAccount: mongoose.model('HostingerAccount', HostingerAccountSchema),
  Website: mongoose.model('Website', WebsiteSchema),
  WebsiteHealth: mongoose.model('WebsiteHealth', WebsiteHealthSchema),
  ThreatLog: mongoose.model('ThreatLog', ThreatLogSchema),
  SSLLog: mongoose.model('SSLLog', SSLLogSchema),
  DNSLog: mongoose.model('DNSLog', DNSLogSchema),
  ScreenshotLog: mongoose.model('ScreenshotLog', ScreenshotLogSchema),
  IncidentLog: mongoose.model('IncidentLog', IncidentLogSchema),
  RestoreLog: mongoose.model('RestoreLog', RestoreLogSchema),
  Notification: mongoose.model('Notification', NotificationSchema),
  Report: mongoose.model('Report', ReportSchema),
  BackupRecord: mongoose.model('BackupRecord', BackupRecordSchema),
};
