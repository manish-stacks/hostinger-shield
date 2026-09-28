const { BackupRecord, RestoreLog, Website } = require('../models');
const exportService = require('../services/exportService');
const { AppError } = require('../utils/errors');

// ─── GET /api/backups ─────────────────────────────────────────────────────────
// Returns all websites with their latest backup info (fallback if no BackupRecord)
exports.getBackups = async (req, res, next) => {
  try {
    const { websiteId, accountId, page = 1, limit = 25 } = req.query;

    const websiteQuery = { isActive: true };
    if (websiteId)  websiteQuery._id = websiteId;
    if (accountId)  websiteQuery.hostingerAccount = accountId;

    const websites = await Website.find(websiteQuery)
      .select('_id domain hostingerAccount lastBackup hostingPlan hostingUsername')
      .populate('hostingerAccount', 'accountName')
      .lean();

    const websiteIds = websites.map((w) => w._id);

    // Latest backup per website
    const latestBackups = await BackupRecord.aggregate([
      { $match: { website: { $in: websiteIds } } },
      { $sort: { backupDate: -1 } },
      { $group: { _id: '$website', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
    ]);

    const backupMap = {};
    latestBackups.forEach((b) => { backupMap[b.website.toString()] = b; });

    // Count per website
    const counts = await BackupRecord.aggregate([
      { $match: { website: { $in: websiteIds } } },
      { $group: { _id: '$website', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach((c) => { countMap[c._id.toString()] = c.count; });

    const now = Date.now();
    const REMINDER_DAYS = 7; // alert if no backup in 7 days

    const merged = websites.map((site) => {
      const latest   = backupMap[site._id.toString()] || null;
      const count    = countMap[site._id.toString()]  || 0;
      const lastDate = latest?.backupDate || site.lastBackup || null;
      const daysSince = lastDate ? Math.floor((now - new Date(lastDate).getTime()) / 86400000) : null;
      const needsBackup = daysSince === null || daysSince >= REMINDER_DAYS;

      return {
        website: { _id: site._id, domain: site.domain, hostingerAccount: site.hostingerAccount, hostingUsername: site.hostingUsername },
        latestBackup: latest,
        lastBackupDate: lastDate,
        daysSinceBackup: daysSince,
        totalBackups: count,
        needsBackup,
        hPanelUrl: site.hostingUsername
          ? `https://hpanel.hostinger.com/hosting/${site.hostingUsername}/backups`
          : `https://hpanel.hostinger.com`,
      };
    });

    const total = merged.length;
    const paginated = merged.slice((page - 1) * limit, page * limit);

    res.json({ success: true, data: paginated, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) } });
  } catch (err) { next(err); }
};

// ─── GET /api/backups/:websiteId ──────────────────────────────────────────────
// All backups for a single website
exports.getWebsiteBackups = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total   = await BackupRecord.countDocuments({ website: req.params.websiteId });
    const backups = await BackupRecord.find({ website: req.params.websiteId })
      .sort({ backupDate: -1 })
      .skip((page - 1) * limit)
      .limit(+limit)
      .lean();
    res.json({ success: true, data: backups, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) } });
  } catch (err) { next(err); }
};

// ─── POST /api/backups/manual ─────────────────────────────────────────────────
// User manually logs a backup they took via hPanel
exports.addManualBackup = async (req, res, next) => {
  try {
    const { websiteId, backupDate, backupType = 'manual', notes, size } = req.body;
    if (!websiteId) return next(new AppError('websiteId is required', 400));

    const website = await Website.findById(websiteId);
    if (!website) return next(new AppError('Website not found', 404));

    const record = await BackupRecord.create({
      website: websiteId,
      user: req.user._id,
      backupDate: backupDate ? new Date(backupDate) : new Date(),
      backupType,
      notes,
      size: size || null,
      status: 'available',
      isHealthy: true,
      metadata: { addedManually: true, addedBy: req.user._id },
    });

    // Update Website.lastBackup
    await Website.findByIdAndUpdate(websiteId, { lastBackup: record.backupDate });

    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
};

// ─── PATCH /api/backups/:id ───────────────────────────────────────────────────
exports.updateBackup = async (req, res, next) => {
  try {
    const backup = await BackupRecord.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!backup) return next(new AppError('Backup not found', 404));
    res.json({ success: true, data: backup });
  } catch (err) { next(err); }
};

// ─── DELETE /api/backups/:id ──────────────────────────────────────────────────
exports.deleteBackup = async (req, res, next) => {
  try {
    await BackupRecord.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Backup record deleted' });
  } catch (err) { next(err); }
};

// ─── POST /api/backups/discover ───────────────────────────────────────────────
exports.discoverBackups = async (req, res, next) => {
  try {
    res.json({ success: true, data: [], message: 'Hostinger shared hosting does not expose backup list via API. Use hPanel or add manual entries.' });
  } catch (err) { next(err); }
};

// ─── GET /api/backups/stats ───────────────────────────────────────────────────
exports.getBackupStats = async (req, res, next) => {
  try {
    const totalSites     = await Website.countDocuments({ isActive: true });
    const sevenDaysAgo   = new Date(Date.now() - 7 * 86400000);
    const thirtyDaysAgo  = new Date(Date.now() - 30 * 86400000);

    // Sites with a backup in last 7 days
    const recentBackups = await BackupRecord.aggregate([
      { $match: { backupDate: { $gte: sevenDaysAgo } } },
      { $group: { _id: '$website' } },
    ]);
    const sitesWithRecentBackup = recentBackups.length;

    // Sites with NO backup in last 30 days
    const sitesWithAnyBackup = await BackupRecord.aggregate([
      { $match: { backupDate: { $gte: thirtyDaysAgo } } },
      { $group: { _id: '$website' } },
    ]);
    const sitesWithBackupIds = new Set(sitesWithAnyBackup.map((s) => s._id.toString()));
    const allSiteIds = (await Website.find({ isActive: true }).distinct('_id')).map((id) => id.toString());
    const sitesNeedingBackup = allSiteIds.filter((id) => !sitesWithBackupIds.has(id)).length;

    const totalBackupRecords = await BackupRecord.countDocuments();
    const manualBackups      = await BackupRecord.countDocuments({ backupType: 'manual' });

    res.json({
      success: true,
      data: { totalSites, sitesWithRecentBackup, sitesNeedingBackup, totalBackupRecords, manualBackups },
    });
  } catch (err) { next(err); }
};

// ─── GET /api/backups/restore-history ────────────────────────────────────────
exports.getRestoreHistory = async (req, res, next) => {
  try {
    const { websiteId, page = 1, limit = 10 } = req.query;
    const query = {};
    if (websiteId) query.website = websiteId;

    const total = await RestoreLog.countDocuments(query);
    const logs  = await RestoreLog.find(query)
      .populate({ path: 'website', select: 'domain', populate: { path: 'hostingerAccount', select: 'accountName' } })
      .sort({ startedAt: -1 })
      .skip((page - 1) * limit)
      .limit(+limit)
      .lean();

    res.json({ success: true, data: logs, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) } });
  } catch (err) { next(err); }
};

// ─── GET /api/backups/restore-history/:id ────────────────────────────────────
exports.getRestoreLog = async (req, res, next) => {
  try {
    const log = await RestoreLog.findById(req.params.id)
      .populate({ path: 'website', select: 'domain', populate: { path: 'hostingerAccount', select: 'accountName' } })
      .lean();
    if (!log) return next(new AppError('Restore log not found', 404));
    res.json({ success: true, data: log });
  } catch (err) { next(err); }
};

// ─── POST /api/backups/restore ────────────────────────────────────────────────
// Log a restore attempt (actual restore is done in hPanel)
exports.logRestore = async (req, res, next) => {
  try {
    const { websiteId, backupDate, restoreType = 'full', notes } = req.body;
    if (!websiteId) return next(new AppError('websiteId is required', 400));

    const log = await RestoreLog.create({
      website: websiteId,
      user: req.user._id,
      backupDate: backupDate ? new Date(backupDate) : null,
      restoreType,
      status: 'completed',
      notes: notes || 'Manually logged restore via hPanel',
      startedAt: new Date(),
      completedAt: new Date(),
    });

    res.status(201).json({ success: true, data: log });
  } catch (err) { next(err); }
};

// ─── POST /api/backups/export ─────────────────────────────────────────────────
exports.exportRestoreLogs = async (req, res, next) => {
  try {
    const { format = 'xlsx', accountId } = req.query;
    const result = await exportService.exportRestoreLogs(req.user._id, format, accountId || null);
    res.download(result.filepath, result.filename, (err) => { if (err) next(err); });
  } catch (err) { next(err); }
};