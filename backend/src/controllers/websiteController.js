const { Website, WebsiteHealth, ThreatLog } = require('../models');
const monitoringService = require('../services/monitoringService');
const threatService = require('../services/threatService');
const sslService = require('../services/sslService');
const { AppError } = require('../utils/errors');
const dnsService        = require('../services/dnsService');
const screenshotService = require('../services/screenshotService');

// GET /api/websites
exports.getWebsites = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      status,
      threatLevel,
      accountId,
      sort = '-createdAt',
    } = req.query;

    const query = {};
    if (search) query.domain = { $regex: search, $options: 'i' };
    if (status) query.status = status;
    if (threatLevel) query.threatLevel = threatLevel;
    if (accountId) query.hostingerAccount = accountId;

    const total = await Website.countDocuments(query);
    const websites = await Website.find(query)
      .populate('hostingerAccount', 'accountName email')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: websites,
      pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/websites/:id
exports.getWebsite = async (req, res, next) => {
  try {
    const website = await Website.findById(req.params.id)
      .populate('hostingerAccount', 'accountName email')
      .lean();

    if (!website) return next(new AppError('Website not found', 404));
    res.json({ success: true, data: website });
  } catch (err) {
    next(err);
  }
};

// POST /api/websites
exports.createWebsite = async (req, res, next) => {
  try {
    const { domain, hostingerAccount, expectedKeywords, notes, alertEmail, alertPhone } = req.body;
    if (!domain) return next(new AppError('Domain is required', 400));
    
    // hostingerAccount optional — if not provided, create without it but schema requires it
    // Make it optional by finding first account or using null
    let accountId = hostingerAccount;
    if (!accountId) {
      const { HostingerAccount } = require('../models');
      const firstAccount = await HostingerAccount.findOne({ isActive: true });
      if (!firstAccount) return next(new AppError('Please add a Hostinger account first', 400));
      accountId = firstAccount._id;
    }

    const website = await Website.create({
      domain: domain.toLowerCase().trim(),
      hostingerAccount: accountId,
      user: req.user._id,
      expectedKeywords,
      notes,
      isActive: true,
    });
    res.status(201).json({ success: true, data: website });
  } catch (err) {
    next(err);
  }
};

// PUT /api/websites/:id
exports.updateWebsite = async (req, res, next) => {
  try {
    const allowed = ['expectedKeywords', 'notes', 'isActive', 'hostingerAccount', 'tags'];
    const update = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const website = await Website.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!website) return next(new AppError('Website not found', 404));
    res.json({ success: true, data: website });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/websites/:id
exports.deleteWebsite = async (req, res, next) => {
  try {
    const website = await Website.findByIdAndDelete(req.params.id);
    if (!website) return next(new AppError('Website not found', 404));
    res.json({ success: true, message: 'Website deleted' });
  } catch (err) {
    next(err);
  }
};

// POST /api/websites/:id/scan
exports.scanWebsite = async (req, res, next) => {
  try {
    const website = await Website.findById(req.params.id);
    if (!website) return next(new AppError('Website not found', 404));

    const [health, threat] = await Promise.allSettled([
      monitoringService.checkWebsite(website),
      threatService.analyzeWebsite(website),
    ]);

    res.json({
      success: true,
      data: {
        health: health.status === 'fulfilled' ? health.value : { error: health.reason?.message },
        threat: threat.status === 'fulfilled' ? threat.value : { error: threat.reason?.message },
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/websites/bulk-scan
exports.bulkScan = async (req, res, next) => {
  try {
    const { ids } = req.body; // array of website IDs or empty for all
    const query = ids?.length ? { _id: { $in: ids }, isActive: true } : { isActive: true };
    const websites = await Website.find(query).lean();

    // Fire async, don't await
    Promise.allSettled(websites.map((w) => threatService.analyzeWebsite(w)));

    res.json({ success: true, message: `Scan started for ${websites.length} websites` });
  } catch (err) {
    next(err);
  }
};

// POST /api/websites/bulk-ssl-check
exports.bulkSSLCheck = async (req, res, next) => {
  try {
    const { ids } = req.body;
    const query = ids?.length ? { _id: { $in: ids }, isActive: true } : { isActive: true };
    const websites = await Website.find(query).lean();

    Promise.allSettled(websites.map((w) => sslService.checkAndSave(w)));

    res.json({ success: true, message: `SSL check started for ${websites.length} websites` });
  } catch (err) {
    next(err);
  }
};

// GET /api/websites/:id/health
exports.getHealth = async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;
    const health = await WebsiteHealth.find({ website: req.params.id })
      .sort({ checkedAt: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({ success: true, data: health });
  } catch (err) {
    next(err);
  }
};

// GET /api/websites/:id/threats
exports.getThreats = async (req, res, next) => {
  try {
    const { limit = 50, resolved } = req.query;
    const query = { website: req.params.id };
    if (resolved !== undefined) query.isResolved = resolved === 'true';

    const threats = await ThreatLog.find(query)
      .sort({ detectedAt: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({ success: true, data: threats });
  } catch (err) {
    next(err);
  }
};

// PUT /api/websites/:id/keywords
exports.updateKeywords = async (req, res, next) => {
  try {
    const { keywords } = req.body;
    const website = await Website.findByIdAndUpdate(
      req.params.id,
      { expectedKeywords: keywords },
      { new: true }
    );
    if (!website) return next(new AppError('Website not found', 404));
    res.json({ success: true, data: website.expectedKeywords });
  } catch (err) {
    next(err);
  }
};

// GET /api/websites/stats/summary
exports.getSummaryStats = async (req, res, next) => {
  try {
    const { ThreatLog, SSLLog } = require('../models');
    const thirtyDaysOut = new Date(Date.now() + 30 * 86400000);
    const [total, healthy, warning, hacked, down, activeThreats, sslExpiring] = await Promise.all([
      Website.countDocuments({ isActive: true }),
      Website.countDocuments({ isActive: true, status: 'healthy' }),
      Website.countDocuments({ isActive: true, status: 'warning' }),
      Website.countDocuments({ isActive: true, status: { $in: ['hacked', 'critical'] } }),
      Website.countDocuments({ isActive: true, status: 'down' }),
      ThreatLog.countDocuments({ isResolved: { $ne: true } }),
      SSLLog.countDocuments({ daysUntilExpiry: { $lte: 30 }, daysUntilExpiry: { $gte: 0 } }),
    ]);
    res.json({
      success: true,
      data: { total, healthy, warning, hacked, down, activeThreats, sslExpiring },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/websites/full-scan
// Runs all checks: health + threat + ssl + dns + screenshot for all (or selected) websites
exports.fullScan = async (req, res, next) => {
  try {
    const { ids } = req.body; // optional array of website IDs; empty = all
    const query = { isActive: true, isMonitoringEnabled: true };
    if (ids?.length) query._id = { $in: ids };

    const websites = await Website.find(query).lean();
    if (websites.length === 0) {
      return res.json({ success: true, message: 'No websites to scan', started: 0 });
    }

    // Respond immediately — run everything in background
    res.json({ success: true, message: `Full scan started for ${websites.length} websites`, started: websites.length });

    // Run all checks in parallel per site, sequentially between sites
    ;(async () => {
      for (const site of websites) {
        await Promise.allSettled([
          monitoringService.checkWebsite(site).catch(e => console.error(`Health: ${site.domain}: ${e.message}`)),
          threatService.analyzeWebsite(site)
            .then(results => threatService.saveThreatResults ? threatService.saveThreatResults(site, results) : null)
            .catch(e => console.error(`Threat: ${site.domain}: ${e.message}`)),
          sslService.checkAndSave(site).catch(e => console.error(`SSL: ${site.domain}: ${e.message}`)),
          dnsService.checkAndSave(site).catch(e => console.error(`DNS: ${site.domain}: ${e.message}`)),
        ]);
      }
      // Screenshots last — launches browser once for all
      await screenshotService.captureAllWebsites().catch(e => console.error(`Screenshot batch: ${e.message}`));
      console.log(`[FullScan] Done for ${websites.length} websites`);
    })();
  } catch (err) {
    next(err);
  }
};