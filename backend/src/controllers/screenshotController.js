const { ScreenshotLog, Website } = require('../models');
const screenshotService = require('../services/screenshotService');
const { AppError } = require('../utils/errors');

const fs   = require('fs');
const path = require('path');

// Convert local filepath to base64 data URI (avoids auth issues with <img> tags)
const toDataUri = (filepath) => {
  if (!filepath) return null;
  try {
    if (!fs.existsSync(filepath)) return null;
    const buf = fs.readFileSync(filepath);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch { return null; }
};

// GET /api/screenshots?websiteId=&hasChanged=&page=&limit=
exports.getScreenshots = async (req, res, next) => {
  try {
    const { websiteId, hasChanged, isDefaced, accountId, search, page = 1, limit = 20 } = req.query;

    // Build website filter
    const websiteQuery = { isActive: true };
    if (websiteId)  websiteQuery._id = websiteId;
    if (accountId)  websiteQuery.hostingerAccount = accountId;
    if (search)     websiteQuery.domain = { $regex: search.trim(), $options: 'i' };

    const matchingWebsites = await Website.find(websiteQuery)
      .select('_id domain hostingerAccount lastScreenshot')
      .populate('hostingerAccount', 'accountName')
      .lean();

    const websiteIds = matchingWebsites.map((w) => w._id);
    if (websiteIds.length === 0) {
      return res.json({ success: true, data: [], pagination: { total: 0 } });
    }

    // Latest screenshot per website
    const pipeline = [
      { $match: { website: { $in: websiteIds } } },
      { $sort: { capturedAt: -1 } },
      { $group: { _id: '$website', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { capturedAt: -1 } },
    ];

    const latestLogs = await ScreenshotLog.aggregate(pipeline);
    await ScreenshotLog.populate(latestLogs, {
      path: 'website',
      select: 'domain lastScreenshot',
      populate: { path: 'hostingerAccount', select: 'accountName' },
    });

    const logMap = {};
    latestLogs.forEach((l) => {
      const wid = l.website?._id?.toString() || l.website?.toString();
      if (wid) logMap[wid] = l;
    });

    // Merge with all websites (fallback for never-screenshotted)
    let merged = matchingWebsites.map((site) => {
      const existing = logMap[site._id.toString()];
      if (existing) {
        // Add public URL from local path
        existing.screenshotUrl = toDataUri(existing.screenshotPath);
        return existing;
      }
      return {
        _id: null,
        website: { _id: site._id, domain: site.domain, hostingerAccount: site.hostingerAccount },
        screenshotUrl: null,
        capturedAt: null,
        hasChanged: false,
        isDefaced: false,
        changePercent: 0,
        error: null,
        _isFallback: true,
      };
    });

    // Apply filters
    if (hasChanged !== undefined)  merged = merged.filter((l) => l.hasChanged  === (hasChanged  === 'true'));
    if (isDefaced  !== undefined)  merged = merged.filter((l) => l.isDefaced   === (isDefaced   === 'true'));

    const total     = merged.length;
    const paginated = merged.slice((page - 1) * limit, page * limit);

    res.json({ success: true, data: paginated, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) } });
  } catch (err) { next(err); }
};

// GET /api/screenshots/:websiteId/history
exports.getHistory = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const total = await ScreenshotLog.countDocuments({ website: req.params.websiteId });
    const logs  = await ScreenshotLog.find({ website: req.params.websiteId })
      .sort({ capturedAt: -1 })
      .skip((page - 1) * limit)
      .limit(+limit)
      .lean();
    res.json({ success: true, data: logs, pagination: { total, page: +page, limit: +limit } });
  } catch (err) { next(err); }
};

// POST /api/screenshots/:websiteId/capture — manual trigger for one site
exports.captureOne = async (req, res, next) => {
  try {
    const website = await Website.findById(req.params.websiteId).lean();
    if (!website) return next(new AppError('Website not found', 404));

    const result = await screenshotService.captureAndCompare(website);
    if (!result.success) return next(new AppError(result.error || 'Capture failed', 500));

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// POST /api/screenshots/capture-all — manual trigger all (admin)
exports.captureAll = async (req, res, next) => {
  try {
    // Non-blocking — respond immediately
    res.json({ success: true, message: 'Screenshot capture started for all websites' });
    screenshotService.captureAllWebsites().catch((e) =>
      console.error('[Screenshot] captureAll error:', e.message)
    );
  } catch (err) { next(err); }
};

// GET /api/screenshots/stats
exports.getStats = async (req, res, next) => {
  try {
    const total     = await Website.countDocuments({ isActive: true });
    const captured  = await ScreenshotLog.distinct('website');
    const defaced   = await ScreenshotLog.countDocuments({ isDefaced: true });
    const changed   = await ScreenshotLog.countDocuments({ hasChanged: true });
    const errors    = await ScreenshotLog.countDocuments({ error: { $ne: null } });
    const apiKeySet = !!process.env.SCREENSHOTONE_API_KEY;

    res.json({ success: true, data: { total, captured: captured.length, defaced, changed, errors, apiKeySet } });
  } catch (err) { next(err); }
};