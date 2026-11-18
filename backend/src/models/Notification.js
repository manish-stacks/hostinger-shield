const mongoose = require('mongoose');

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
    telegram: { sent: Boolean, sentAt: Date, error: String },
    webhook: { sent: Boolean, sentAt: Date, error: String },
    inApp: { sent: Boolean, readAt: Date },
    push: { sent: Boolean, sentAt: Date, error: String },
  },
  isRead: { type: Boolean, default: false },
  readAt: Date,
  actionUrl: String,
}, { timestamps: true });

const NOTIF_TTL_DAYS = Math.max(1, parseInt(process.env.RETAIN_NOTIF_DAYS) || 10);
NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIF_TTL_DAYS * 24 * 3600 });

module.exports = mongoose.model('Notification', NotificationSchema);
