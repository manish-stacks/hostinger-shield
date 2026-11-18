const {
  Website, WebsiteHealth, ThreatLog, SSLLog, DNSLog, ScreenshotLog, IncidentLog,
} = require('../models');
const monitoringService = require('../services/monitoringService');
const threatService = require('../services/threatService');
const sslService = require('../services/sslService');
const dnsService = require('../services/dnsService');
const screenshotService = require('../services/screenshotService');
const { fetchPage } = require('../services/contentAnalyzer');
const cheerio = require('cheerio');
const { AppError } = require('../utils/errors');

// Normalize raw domain input (strips protocol, paths, whitespace, port)
function normalizeDomain(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  d = d.replace(/\.$/, '');
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d) ? d : '';
}

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
      serverName,
      sort = '-createdAt',
    } = req.query;

    const query = {};
    if (search) {
      const rx = { $regex: search.trim(), $options: 'i' };
      query.$or = [{ domain: rx }, { serverName: rx }, { ipAddress: rx }, { tags: rx }];
    }
    if (status === 'slow') {
      query.responseTime = { $gt: 3000 };
    } else if (status === 'ssl_expiring') {
      query.sslDaysLeft = { $gte: 0, $lte: 30 };
    } else if (status === 'ssl_expired') {
      query.sslDaysLeft = { $lt: 0 };
    } else if (status) {
      query.status = status;
    }
    if (threatLevel) query.threatLevel = threatLevel;
    if (accountId) query.hostingerAccount = accountId;
    if (serverName) query.serverName = serverName;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const total = await Website.countDocuments(query);
    const websites = await Website.find(query)
      .populate('hostingerAccount', 'accountName email')
      .sort(sort)
      .skip((pageNum - 1) * lim)
      .limit(lim)
      .lean();

    res.json({
      success: true,
      data: websites,
      pagination: { total, page: pageNum, limit: lim, pages: Math.ceil(total / lim) },
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
    const {
      domain: rawDomain, hostingerAccount, accountId: reqAccountId,
      expectedKeywords, notes, alertEmail, alertPhone, serverName, tags,
    } = req.body;

    const domain = normalizeDomain(rawDomain);
    if (!domain) return next(new AppError('Please enter a valid domain name (e.g. example.com)', 400));

    const accountId = hostingerAccount || reqAccountId || null;

    const existing = await Website.findOne({ domain, hostingerAccount: accountId });
    if (existing) return next(new AppError(`Domain ${domain} is already monitored`, 400));

    const website = await Website.create({
      domain,
      hostingerAccount: accountId || undefined,
      user: req.user._id,
      expectedKeywords: Array.isArray(expectedKeywords) ? expectedKeywords : [],
      notes,
      alertEmail: alertEmail || undefined,
      alertPhone: alertPhone || undefined,
      serverName: serverName || undefined,
      tags: Array.isArray(tags) ? tags : [],
      isActive: true,
      isMonitoringEnabled: true,
    });

    // Run immediate initial health + SSL check in background so dashboard populates fast
    setImmediate(async () => {
      try {
        await monitoringService.checkWebsite(website);
        await sslService.checkAndSave(website);
      } catch {}
    });

    res.status(201).json({ success: true, data: website });
  } catch (err) {
    next(err);
  }
};

// POST /api/websites/bulk-import
exports.bulkImport = async (req, res, next) => {
  try {
    const { domains, accountId, hostingerAccount, serverName, tags, runImmediateCheck = true } = req.body;
    const rawList = Array.isArray(domains)
      ? domains
      : String(domains || '').split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);

    if (!rawList.length) return next(new AppError('Provide at least one domain to import', 400));

    const accId = hostingerAccount || accountId || null;
    const valid = [];
    const invalid = [];
    const seen = new Set();

    for (const raw of rawList) {
      const d = normalizeDomain(raw);
      if (!d) {
        invalid.push(raw);
        continue;
      }
      if (!seen.has(d)) {
        seen.add(d);
        valid.push(d);
      }
    }

    const existingDocs = await Website.find({ domain: { $in: valid } }).select('domain').lean();
    const existingSet = new Set(existingDocs.map((w) => w.domain));
    const toInsert = valid.filter((d) => !existingSet.has(d));

    const created = toInsert.length
      ? await Website.insertMany(
          toInsert.map((domain) => ({
            domain,
            hostingerAccount: accId || undefined,
            user: req.user._id,
            serverName: serverName || undefined,
            tags: Array.isArray(tags) ? tags : [],
            isActive: true,
            isMonitoringEnabled: true,
            status: 'unknown',
          })),
          { ordered: false }
        )
      : [];

    if (runImmediateCheck && created.length) {
      setImmediate(async () => {
        for (const site of created) {
          await monitoringService.checkWebsite(site).catch(() => {});
        }
      });
    }

    res.status(201).json({
      success: true,
      data: {
        added: created.length,
        skipped: valid.length - toInsert.length,
        invalid: invalid.length,
        invalidSamples: invalid.slice(0, 10),
      },
      message: `Imported ${created.length} website(s)${valid.length - toInsert.length ? `, skipped ${valid.length - toInsert.length} existing` : ''}`,
    });
  } catch (err) {
    next(err);
  }
};

// PUT / PATCH /api/websites/:id
exports.updateWebsite = async (req, res, next) => {
  try {
    const allowed = [
      'expectedKeywords', 'notes', 'isActive', 'isMonitoringEnabled',
      'hostingerAccount', 'tags', 'serverName', 'alertEmail', 'alertPhone', 'threatAllowlist',
    ];
    const update = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const website = await Website.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!website) return next(new AppError('Website not found', 404));
    res.json({ success: true, data: website });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/websites/:id/toggle-monitoring
exports.toggleMonitoring = async (req, res, next) => {
  try {
    const website = await Website.findById(req.params.id);
    if (!website) return next(new AppError('Website not found', 404));
    website.isMonitoringEnabled = !website.isMonitoringEnabled;
    await website.save();
    res.json({ success: true, data: { isMonitoringEnabled: website.isMonitoringEnabled } });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/websites/:id (cascade cleans child logs to prevent DB orphans)
exports.deleteWebsite = async (req, res, next) => {
  try {
    const website = await Website.findByIdAndDelete(req.params.id);
    if (!website) return next(new AppError('Website not found', 404));

    await Promise.allSettled([
      WebsiteHealth.deleteMany({ website: website._id }),
      ThreatLog.deleteMany({ website: website._id }),
      SSLLog.deleteMany({ website: website._id }),
      DNSLog.deleteMany({ website: website._id }),
      ScreenshotLog.deleteMany({ website: website._id }),
    ]);

    res.json({ success: true, message: 'Website and associated logs deleted' });
  } catch (err) {
    next(err);
  }
};

// POST /api/websites/ping-down — instant parallel re-check of all currently DOWN sites
exports.pingDownWebsites = async (req, res, next) => {
  try {
    const downSites = await Website.find({ isActive: true, status: 'down' }).lean();
    if (!downSites.length) {
      return res.json({ success: true, data: { checked: 0, recovered: 0, stillDown: 0 }, message: 'No down sites to check' });
    }
    const results = await Promise.allSettled(downSites.map((s) => monitoringService.checkWebsite(s)));
    let recovered = 0;
    let stillDown = 0;
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value?.isUp) recovered++;
      else stillDown++;
    }
    res.json({
      success: true,
      data: { checked: downSites.length, recovered, stillDown },
      message: `Checked ${downSites.length} site(s): ${recovered} recovered, ${stillDown} still down`,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/websites/:id/ping — instant live health check
exports.pingWebsite = async (req, res, next) => {
  try {
    const website = await Website.findById(req.params.id);
    if (!website) return next(new AppError('Website not found', 404));
    const health = await monitoringService.checkWebsite(website);
    res.json({ success: true, data: health });
  } catch (err) {
    next(err);
  }
};

// POST /api/websites/:id/baseline — capture live title/meta as defacement baseline
exports.setBaseline = async (req, res, next) => {
  try {
    const website = await Website.findById(req.params.id);
    if (!website) return next(new AppError('Website not found', 404));

    const { expectedKeywords, threatAllowlist } = req.body || {};
    const page = await fetchPage(website.domain);
    const $ = cheerio.load(page.html);
    const title = $('title').first().text().trim();
    const metaDescription = $('meta[name="description"]').attr('content') || '';

    const update = {
      contentBaseline: { title, metaDescription, capturedAt: new Date() },
      isBaselinesSet: Boolean(title),
    };
    if (Array.isArray(expectedKeywords)) update.expectedKeywords = expectedKeywords;
    if (Array.isArray(threatAllowlist)) update.threatAllowlist = threatAllowlist;

    const updated = await Website.findByIdAndUpdate(website._id, update, { new: true });
    res.json({ success: true, data: updated, message: 'Content baseline captured' });
  } catch (err) {
    next(err);
  }
};

// POST /api/websites/:id/scan
exports.scanWebsite = async (req, res, next) => {
  try {
    const website = await Website.findById(req.params.id);
    if (!website) return next(new AppError('Website not found', 404));

    const [health, threat, ssl, dns] = await Promise.allSettled([
      monitoringService.checkWebsite(website),
      threatService.analyzeWebsite(website, { mode: 'full' })
        .then(async (r) => { await threatService.saveThreatResults(website, r, req.app.get('io')); return r; }),
      sslService.checkAndSave(website),
      dnsService.checkAndSave(website),
    ]);

    res.json({
      success: true,
      data: {
        health: health.status === 'fulfilled' ? health.value : { error: health.reason?.message },
        threat: threat.status === 'fulfilled' ? threat.value : { error: threat.reason?.message },
        ssl: ssl.status === 'fulfilled' ? { isValid: ssl.value.isValid, daysLeft: ssl.value.daysUntilExpiry } : { error: ssl.reason?.message },
        dns: dns.status === 'fulfilled' ? { hasChanged: dns.value.hasChanged } : { error: dns.reason?.message },
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/websites/bulk-scan
exports.bulkScan = async (req, res, next) => {
  try {
    const { ids } = req.body;
    const query = ids?.length ? { _id: { $in: ids }, isActive: true } : { isActive: true };
    const websites = await Website.find(query).lean();

    const io = req.app.get('io');
    (async () => {
      for (const w of websites) {
        try {
          await monitoringService.checkWebsite(w);
          const r = await threatService.analyzeWebsite(w, { mode: 'full' });
          await threatService.saveThreatResults(w, r, io);
        } catch (e) { console.error(`Bulk scan ${w.domain}: ${e.message}`); }
      }
      io?.to(`user:${req.user._id}`).emit('scan:completed', { count: websites.length });
    })();

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
      .limit(Math.min(200, parseInt(limit, 10) || 50))
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
      .limit(Math.min(200, parseInt(limit, 10) || 50))
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

// GET /api/websites/stats — rich dashboard stats + 7d threat trend + critical site lists
exports.getSummaryStats = async (req, res, next) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const thirtyDaysAhead = new Date(Date.now() + 30 * 86400000);

    const [
      total, healthy, warning, hacked, down, unknown, paused,
      activeThreats, openIncidents, sslExpiring, sslExpired, slowSites,
      perfAgg, trendAgg, downSites, hackedSites, liveMatrix, expiringDomains,
    ] = await Promise.all([
      Website.countDocuments({ isActive: true }),
      Website.countDocuments({ isActive: true, status: 'healthy' }),
      Website.countDocuments({ isActive: true, status: 'warning' }),
      Website.countDocuments({ isActive: true, status: { $in: ['hacked', 'critical'] } }),
      Website.countDocuments({ isActive: true, status: 'down' }),
      Website.countDocuments({ isActive: true, status: { $in: ['unknown', null] } }),
      Website.countDocuments({ isActive: true, isMonitoringEnabled: false }),
      ThreatLog.countDocuments({ isResolved: { $ne: true } }),
      IncidentLog.countDocuments({ status: { $in: ['open', 'acknowledged', 'in_progress'] } }),
      Website.countDocuments({ isActive: true, sslDaysLeft: { $gte: 0, $lte: 30 } }),
      Website.countDocuments({ isActive: true, sslDaysLeft: { $lt: 0 } }),
      Website.countDocuments({ isActive: true, responseTime: { $gt: 3000 } }),
      Website.aggregate([
        { $match: { isActive: true, responseTime: { $gt: 0 } } },
        { $group: { _id: null, avgResp: { $avg: '$responseTime' }, avgUptime: { $avg: '$uptime24h' } } },
      ]),
      ThreatLog.aggregate([
        { $match: { detectedAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$detectedAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Website.find({ isActive: true, status: 'down' })
        .select('_id domain httpStatus lastError downSince responseTime')
        .sort({ downSince: -1 })
        .limit(10)
        .lean(),
      Website.find({ isActive: true, status: { $in: ['hacked', 'critical'] } })
        .select('_id domain threatScore threatLevel lastThreatScan')
        .sort({ threatScore: -1 })
        .limit(10)
        .lean(),
      Website.find({ isActive: true })
        .select('_id domain status responseTime httpStatus sslDaysLeft uptime24h isMonitoringEnabled')
        .sort({ status: 1, domain: 1 })
        .limit(60)
        .lean(),
      Website.find({ isActive: true, domainExpiry: { $ne: null, $lte: thirtyDaysAhead } })
        .select('_id domain domainExpiry')
        .sort({ domainExpiry: 1 })
        .limit(10)
        .lean(),
    ]);

    // Build complete 7-day trend array (zero-filled for empty days)
    const trendLookup = Object.fromEntries(trendAgg.map((t) => [t._id, t.count]));
    const trend7d = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      trend7d.push({ date: label, iso, count: trendLookup[iso] || 0 });
    }

    const avgResponseTime = perfAgg[0]?.avgResp ? Math.round(perfAgg[0].avgResp) : 0;
    const avgUptime = perfAgg[0]?.avgUptime != null
      ? Number(perfAgg[0].avgUptime.toFixed(1))
      : total > 0 ? Number((((total - down) / total) * 100).toFixed(1)) : 100;

    res.json({
      success: true,
      data: {
        total,
        healthy,
        warning,
        hacked,
        down,
        unknown,
        paused,
        activeThreats,
        openIncidents,
        sslExpiring,
        sslExpired,
        slowSites,
        avgResponseTime,
        avgUptime,
        trend7d,
        downSites,
        hackedSites,
        liveMatrix,
        expiringDomains,
        domainExpiring: expiringDomains.length,
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/websites/full-scan
exports.fullScan = async (req, res, next) => {
  try {
    const { ids } = req.body;
    const query = { isActive: true, isMonitoringEnabled: true };
    if (ids?.length) query._id = { $in: ids };

    const websites = await Website.find(query).lean();
    if (websites.length === 0) {
      return res.json({ success: true, message: 'No websites to scan', started: 0 });
    }

    res.json({ success: true, message: `Full scan started for ${websites.length} websites`, started: websites.length });

    const io = req.app.get('io');
    ;(async () => {
      for (const site of websites) {
        await Promise.allSettled([
          monitoringService.checkWebsite(site).catch((e) => console.error(`Health: ${site.domain}: ${e.message}`)),
          threatService.analyzeWebsite(site, { mode: 'full' })
            .then((results) => threatService.saveThreatResults(site, results, io))
            .catch((e) => console.error(`Threat: ${site.domain}: ${e.message}`)),
          sslService.checkAndSave(site).catch((e) => console.error(`SSL: ${site.domain}: ${e.message}`)),
          dnsService.checkAndSave(site).catch((e) => console.error(`DNS: ${site.domain}: ${e.message}`)),
        ]);
      }
      if (!ids?.length) {
        await screenshotService.captureAllWebsites().catch((e) => console.error(`Screenshot batch: ${e.message}`));
      } else {
        for (const site of websites) {
          await screenshotService.captureAndCompare(site).catch(() => {});
        }
      }
      io?.to(`user:${req.user._id}`).emit('scan:completed', { count: websites.length });
    })();
  } catch (err) {
    next(err);
  }
};
