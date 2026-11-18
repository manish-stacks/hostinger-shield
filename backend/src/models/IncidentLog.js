const mongoose = require('mongoose');

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
  alertCount: { type: Number, default: 1 },
  lastAlertAt: { type: Date, default: Date.now },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolution: String,
}, { timestamps: true });

IncidentLogSchema.index({ status: 1, detectionTime: -1 });
IncidentLogSchema.index({ website: 1, status: 1 });

module.exports = mongoose.model('IncidentLog', IncidentLogSchema);
