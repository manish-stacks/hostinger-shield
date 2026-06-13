const mongoose = require('mongoose');

const DNSLogSchema = new mongoose.Schema({
  website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true, index: true },
  checkedAt: { type: Date, default: Date.now },
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

module.exports = mongoose.model('DNSLog', DNSLogSchema);
