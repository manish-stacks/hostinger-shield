const {
  ThreatLog, IncidentLog, SSLLog, DNSLog, ScreenshotLog, Notification, Website,
} = require('../models');
const threatService = require('../services/threatService');
const sslService = require('../services/sslService');
const dnsService = require('../services/dnsService');
const { AppError } = require('../utils/errors');

// ─── Helper: resolve accountId → website IDs filter ──────────────────────────
async function websiteFilter(accountId) {
  if (!accountId) return null;
  const ids = await Website.find({ hostingerAccount: accountId }).distinct('_id');
  return { $in: ids };
}

// ─── THREAT CENTER ────────────────────────────────────────────────────────────

exports.getThreats = async (req, res, next) => {
  try {
    const { page = 1, limit = 25, severity, type, resolved, status, websiteId, accountId, search, sort = '-detectedAt' } = req.query;
    const query = {};
    if (severity) query.severity = severity;
    if (type) query.threatType = type;
    if (resolved !== undefined) query.isResolved = resolved === 'true';
    if (status === 'active') query.isResolved = false;
    if (status === 'resolved') query.isResolved = true;
    if (websiteId) query.website = websiteId;
    // search or accountId → resolve to website IDs
    if (search || accountId) {
      const siteQuery = {};
      if (accountId) siteQuery.hostingerAccount = accountId;
      if (search) siteQuery.domain = { $regex: search.trim(), $options: 'i' };
      const ids = await Website.find(siteQuery).distinct('_id');
      query.website = { $in: ids };
    }

    const total = await ThreatLog.countDocuments(query);
    const threats = await ThreatLog.find(query)
      .populate({ path: 'website', select: 'domain status threatLevel', populate: { path: 'hostingerAccount', select: 'accountName' } })
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json({ success: true, data: threats, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) } });
  } catch (err) { next(err); }
};

exports.getThreat = async (req, res, next) => {
  try {
    const threat = await ThreatLog.findById(req.params.id)
      .populate({ path: 'website', select: 'domain status', populate: { path: 'hostingerAccount', select: 'accountName' } })
      .lean();
    if (!threat) return next(new AppError('Threat not found', 404));
    res.json({ success: true, data: threat });
  } catch (err) { next(err); }
};

exports.resolveThreat = async (req, res, next) => {
  try {
    const threat = await ThreatLog.findByIdAndUpdate(
      req.params.id,
      { isResolved: true, resolvedAt: new Date(), resolvedBy: req.user._id },
      { new: true }
    );
    if (!threat) return next(new AppError('Threat not found', 404));
    res.json({ success: true, data: threat });
  } catch (err) { next(err); }
};

// ─── INCIDENTS ────────────────────────────────────────────────────────────────

exports.getIncidents = async (req, res, next) => {
  try {
    const { page = 1, limit = 25, status: incStatus, websiteId, accountId, severity, search } = req.query;
    const query = {};

    if (incStatus === 'open') query.status = { $in: ['open', 'acknowledged', 'in_progress'] };
    else if (incStatus === 'resolved') query.status = { $in: ['resolved', 'closed'] };
    else if (incStatus === 'in_progress') query.status = 'in_progress';

    if (severity) query.severity = severity;
    if (websiteId) query.website = websiteId;
    if (search || accountId) {
      const siteQuery = {};
      if (accountId) siteQuery.hostingerAccount = accountId;
      if (search) siteQuery.domain = { $regex: search.trim(), $options: 'i' };
      const ids = await Website.find(siteQuery).distinct('_id');
      query.website = { $in: ids };
    }

    const total = await IncidentLog.countDocuments(query);
    const incidents = await IncidentLog.find(query)
      .populate({ path: 'website', select: 'domain status threatLevel', populate: { path: 'hostingerAccount', select: 'accountName' } })
      .sort('-detectionTime')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const normalized = incidents.map(i => ({ ...i, type: i.incidentType }));
    res.json({ success: true, data: normalized, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) } });
  } catch (err) { next(err); }
};

exports.getIncident = async (req, res, next) => {
  try {
    const incident = await IncidentLog.findById(req.params.id)
      .populate({ path: 'website', select: 'domain status threatLevel hostingPlan', populate: { path: 'hostingerAccount', select: 'accountName' } })
      .populate('resolvedBy', 'name email')
      .lean();
    if (!incident) return next(new AppError('Incident not found', 404));
    res.json({ success: true, data: incident });
  } catch (err) { next(err); }
};

exports.resolveIncident = async (req, res, next) => {
  try {
    const incident = await IncidentLog.findByIdAndUpdate(
      req.params.id,
      { status: 'resolved', resolutionTime: new Date() },
      { new: true }
    );
    if (!incident) return next(new AppError('Incident not found', 404));
    res.json({ success: true, data: incident });
  } catch (err) { next(err); }
};

// ─── SSL ──────────────────────────────────────────────────────────────────────

exports.getSSLLogs = async (req, res, next) => {
  try {
    const { websiteId, status, accountId, page = 1, limit = 25 } = req.query;

    // Build website filter
    const websiteQuery = { isActive: true };
    if (websiteId) websiteQuery._id = websiteId;
    if (accountId) websiteQuery.hostingerAccount = accountId;

    // SSLLog has no 'status' field — filter via isValid / daysUntilExpiry
    const sslMatchStage = {};
    if (status === 'valid')    { sslMatchStage.isValid = true; sslMatchStage.daysUntilExpiry = { $gt: 30 }; }
    if (status === 'expiring') { sslMatchStage.isValid = true; sslMatchStage.daysUntilExpiry = { $gte: 0, $lte: 30 }; }
    if (status === 'expired')  { sslMatchStage.daysUntilExpiry = { $lte: 0 }; }
    if (status === 'invalid')  { sslMatchStage.isValid = false; }

    // Get matching website IDs first
    const matchingWebsites = await Website.find(websiteQuery)
      .select('_id domain sslStatus sslExpiry sslDaysLeft hostingerAccount')
      .populate('hostingerAccount', 'accountName')
      .lean();

    const websiteIds = matchingWebsites.map((w) => w._id);

    if (websiteIds.length === 0) {
      return res.json({ success: true, data: [], pagination: { total: 0, page: +page, limit: +limit, pages: 0 } });
    }

    // Get latest SSL log per website
    const pipeline = [
      { $match: { website: { $in: websiteIds }, ...sslMatchStage } },
      { $sort: { checkedAt: -1 } },
      { $group: { _id: '$website', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { checkedAt: -1 } },
    ];

    const sslDocs = await SSLLog.aggregate(pipeline);

    // Populate website on aggregation results
    await SSLLog.populate(sslDocs, {
      path: 'website',
      select: 'domain sslStatus sslExpiry sslDaysLeft',
      populate: { path: 'hostingerAccount', select: 'accountName' },
    });

    // Build a map of websiteId → sslDoc
    const sslMap = {};
    sslDocs.forEach((d) => {
      const wid = d.website?._id?.toString() || d.website?.toString();
      if (wid) sslMap[wid] = d;
    });

    // Merge: for websites with no SSLLog entry yet, fallback to Website.sslStatus fields
    const merged = matchingWebsites.map((site) => {
      const existing = sslMap[site._id.toString()];
      if (existing) return existing;
      // Fallback — synthesize from Website model fields
      return {
        _id: site._id,
        website: { _id: site._id, domain: site.domain, hostingerAccount: site.hostingerAccount },
        isValid: site.sslStatus === 'valid' || site.sslStatus === 'expiring',
        validTo: site.sslExpiry || null,
        daysUntilExpiry: site.sslDaysLeft ?? null,
        issuer: null,
        checkedAt: null,
        _isFallback: true,
      };
    });

    // Apply status filter on merged (for fallback rows)
    const filtered = status ? merged.filter((d) => {
      const days = d.daysUntilExpiry;
      if (status === 'valid')    return d.isValid && days > 30;
      if (status === 'expiring') return d.isValid && days >= 0 && days <= 30;
      if (status === 'expired')  return days !== null && days <= 0;
      if (status === 'invalid')  return !d.isValid;
      return true;
    }) : merged;

    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    res.json({ success: true, data: paginated, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) } });
  } catch (err) { next(err); }
};

exports.getSSLExpiring = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const cutoff = new Date(Date.now() + days * 86400000);
    const expiring = await SSLLog.aggregate([
      { $sort: { checkedAt: -1 } },
      { $group: { _id: '$website', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $match: { validTo: { $lte: cutoff }, error: { $eq: null } } },
      { $sort: { validTo: 1 } },
    ]);
    res.json({ success: true, data: expiring });
  } catch (err) { next(err); }
};

// ─── DNS ──────────────────────────────────────────────────────────────────────

exports.getDNSLogs = async (req, res, next) => {
  try {
    const { websiteId, hasChanged, accountId, page = 1, limit = 25 } = req.query;

    // Build website filter
    const websiteQuery = { isActive: true };
    if (websiteId) websiteQuery._id = websiteId;
    if (accountId) websiteQuery.hostingerAccount = accountId;

    // Get matching websites
    const matchingWebsites = await Website.find(websiteQuery)
      .select('_id domain hostingerAccount')
      .populate('hostingerAccount', 'accountName')
      .lean();

    const websiteIds = matchingWebsites.map((w) => w._id);

    if (websiteIds.length === 0) {
      return res.json({ success: true, data: [], pagination: { total: 0, page: +page, limit: +limit, pages: 0 } });
    }

    // Get latest DNS log per website
    const pipeline = [
      { $match: { website: { $in: websiteIds }, ...(hasChanged !== undefined ? { hasChanged: hasChanged === 'true' } : {}) } },
      { $sort: { checkedAt: -1 } },
      { $group: { _id: '$website', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { checkedAt: -1 } },
    ];

    const dnsLogs = await DNSLog.aggregate(pipeline);
    await DNSLog.populate(dnsLogs, {
      path: 'website',
      select: 'domain',
      populate: { path: 'hostingerAccount', select: 'accountName' },
    });

    // Map websiteId → dnsLog
    const dnsMap = {};
    dnsLogs.forEach((d) => {
      const wid = d.website?._id?.toString() || d.website?.toString();
      if (wid) dnsMap[wid] = d;
    });

    // Merge: fallback rows for websites with no DNS log yet
    let merged = matchingWebsites.map((site) => {
      const existing = dnsMap[site._id.toString()];
      if (existing) return existing;
      return {
        _id: site._id,
        website: { _id: site._id, domain: site.domain, hostingerAccount: site.hostingerAccount },
        hasChanged: false,
        records: null,
        checkedAt: null,
        _isFallback: true,
      };
    });

    // Apply hasChanged filter on merged result
    if (hasChanged !== undefined) {
      merged = merged.filter((d) => d.hasChanged === (hasChanged === 'true'));
    }

    const total = merged.length;
    const paginated = merged.slice((page - 1) * limit, page * limit);

    res.json({ success: true, data: paginated, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) } });
  } catch (err) { next(err); }
};

// ─── SCREENSHOTS ──────────────────────────────────────────────────────────────

exports.getScreenshots = async (req, res, next) => {
  try {
    const { websiteId, hasVisualChange, limit = 20 } = req.query;
    const query = {};
    if (websiteId) query.website = websiteId;
    if (hasVisualChange !== undefined) query.hasVisualChange = hasVisualChange === 'true';
    const screenshots = await ScreenshotLog.find(query)
      .populate('website', 'domain')
      .sort({ capturedAt: -1 })
      .limit(parseInt(limit))
      .lean();
    res.json({ success: true, data: screenshots });
  } catch (err) { next(err); }
};

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

exports.getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, isRead, type } = req.query;
    const query = { user: req.user._id };
    if (isRead !== undefined) query.isRead = isRead === 'true';
    if (type) query.type = type;
    const total = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .populate({ path: 'website', select: 'domain hostingerAccount', populate: { path: 'hostingerAccount', select: 'accountName' } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();
    res.json({ success: true, data: notifications, pagination: { total } });
  } catch (err) { next(err); }
};

exports.markNotificationRead = async (req, res, next) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true });
  } catch (err) { next(err); }
};

exports.markAllNotificationsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true });
  } catch (err) { next(err); }
};

exports.getUnreadCount = async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({ user: req.user._id, isRead: false });
    res.json({ success: true, data: { count } });
  } catch (err) { next(err); }
};