const { Website, ThreatLog, IncidentLog, Notification } = require('../models');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');
const { COVERAGE, HACK_TYPES, fetchPage, analyzeContent } = require('./contentAnalyzer');
const guard = require('./guardService');

const num = (v, d) => (Number.isFinite(parseInt(v)) ? parseInt(v) : d);
const OPEN_STATUSES = ['open', 'acknowledged', 'in_progress'];

const overallScore = (threats) => {
  if (!threats.length) return 0;
  const max = Math.max(...threats.map((t) => t.score || 0));
  return Math.min(max + Math.min(threats.length * 5, 20), 100);
};

// ─── SCAN ─────────────────────────────────────────────────────────────────────
// mode: 'light' (homepage only, cheap – runs every few minutes)
//       'full'  (light + vulnerability probes + WordPress checks + blacklist)
async function analyzeWebsite(website, { mode = 'full' } = {}) {
  const results = { website: website._id, domain: website.domain, threats: [], overallScore: 0, isHacked: false, mode, rawData: {} };

  try {
    const page = await fetchPage(website.domain);
    if (page.status >= 500 || page.status === 403 || page.status === 429) {
      // Error page / WAF block: can't judge content → don't raise or clear anything
      results.error = `HTTP ${page.status}`;
      return results;
    }
    const { threats, meta } = analyzeContent(page.html, website, page.finalUrl);
    results.threats.push(...threats);
    results.rawData = meta;

    if (mode === 'full') {
      const extra = await Promise.allSettled([
        guard.scanVulnerabilities(website.domain),
        guard.wpChecks(website),
        guard.spamhausCheck(website.domain),
      ]);
      extra.forEach((r) => { if (r.status === 'fulfilled') results.threats.push(...r.value); });
    }
  } catch (err) {
    logger.error(`Threat scan error for ${website.domain}: ${err.message}`);
    results.error = err.message;
    return results;
  }

  results.overallScore = overallScore(results.threats);
  results.isHacked = results.threats.some((t) => HACK_TYPES.includes(t.type) && t.score >= 60);
  return results;
}

// Cloaking scan (Googlebot / mobile-from-Google variants)
async function analyzeCloaking(website) {
  const threats = await guard.cloakingScan(website);
  return { website: website._id, domain: website.domain, threats, mode: 'cloak', overallScore: overallScore(threats), isHacked: threats.length > 0 };
}

// ─── SAVE ─────────────────────────────────────────────────────────────────────
async function saveThreatResults(website, results, io, coverage) {
  try {
    if (results.error) return []; // unreliable scan → change nothing
    const cover = coverage || COVERAGE[results.mode] || COVERAGE.light;
    const now = new Date();
    const detected = new Set(results.threats.map((t) => t.type));
    const newThreats = [];

    for (const threat of results.threats) {
      const existing = await ThreatLog.findOne({ website: website._id, threatType: threat.type, isResolved: false }).select('_id');
      if (existing) {
        await ThreatLog.updateOne({ _id: existing._id }, { lastSeenAt: now });
        continue;
      }
      const log = await ThreatLog.create({
        website: website._id, user: website.user,
        threatType: threat.type, severity: threat.severity, score: threat.score,
        title: `${threat.type.replace(/_/g, ' ').toUpperCase()} detected on ${website.domain}`,
        description: threat.description, evidence: threat.evidence,
      });
      newThreats.push(log);
    }

    // Auto-resolve threats this scan type covers but no longer sees (site cleaned)
    await ThreatLog.updateMany(
      {
        website: website._id, isResolved: false,
        threatType: { $in: cover.filter((t) => !detected.has(t)) },
        $or: [{ lastSeenAt: { $lt: new Date(Date.now() - 15 * 60000) } }, { lastSeenAt: { $exists: false } }],
      },
      { isResolved: true, resolvedAt: now, autoResolved: true, resolution: 'Auto-resolved: not detected in latest scan' }
    );

    // Recompute site state from ALL open threats (not just this scan's)
    const open = await ThreatLog.find({ website: website._id, isResolved: false }).select('threatType score').lean();
    const overall = overallScore(open.map((t) => ({ score: t.score })));
    const hacked = open.some((t) => HACK_TYPES.includes(t.threatType) && t.score >= 60);
    const status = hacked ? 'hacked' : overall >= 30 ? 'warning' : 'healthy';
    const level = overall >= 75 ? 'critical' : overall >= 50 ? 'high_risk' : overall >= 25 ? 'warning' : 'safe';

    await Website.findByIdAndUpdate(website._id, { threatScore: overall, threatLevel: level, status, lastThreatScan: now });

    // Hack incident / alerts for NEW hack-type threats
    const hackNew = newThreats.filter((t) => HACK_TYPES.includes(t.threatType) && t.score >= 60);
    if (hackNew.length) await openOrUpdateIncident(website, hackNew, overall, io);

    // New vulnerabilities (not hack): alert without the "HACKED" wording
    const vulnNew = newThreats.filter((t) => !HACK_TYPES.includes(t.threatType) && t.score >= 60);
    for (const t of vulnNew) {
      await notificationService.sendGenericAlert({
        website, type: 'warning', severity: t.severity,
        title: `Security issue: ${website.domain}`,
        message: `${t.threatType.replace(/_/g, ' ')} — ${t.description}`,
      }).catch(() => {});
    }

    // Recovery: no hack-type threats left → close open incident
    if (!hacked) await autoResolveIncident(website, io);

    return newThreats;
  } catch (err) {
    logger.error(`Save threat results error (${website.domain}): ${err.message}`);
    return [];
  }
}

// ─── INCIDENTS ────────────────────────────────────────────────────────────────
async function openOrUpdateIncident(website, threats, score, io) {
  const primary = [...threats].sort((a, b) => b.score - a.score)[0];
  const existing = await IncidentLog.findOne({ website: website._id, status: { $in: OPEN_STATUSES } });

  if (existing) {
    await IncidentLog.updateOne({ _id: existing._id }, {
      $addToSet: { relatedThreats: { $each: threats.map((t) => t._id) } },
      $push: { timeline: { event: 'threat_detected', description: `New threat: ${threats.map((t) => t.threatType).join(', ')}`, timestamp: new Date() } },
    });
    return existing;
  }

  const incident = await IncidentLog.create({
    website: website._id, user: website.user,
    incidentType: primary.threatType, severity: 'critical',
    title: `Website Hacked: ${website.domain}`,
    description: `${threats.length} threat(s) detected. Primary: ${primary.title}`,
    detectionTime: new Date(), alertTime: new Date(), alertCount: 1, lastAlertAt: new Date(),
    relatedThreats: threats.map((t) => t._id),
    timeline: [{ event: 'threat_detected', description: `${threats.length} threats detected by automated scanner`, timestamp: new Date() }],
  });

  await notificationService.sendHackAlert({ website, incident, threats, threatScore: score });

  if (io) {
    io.to(`user:${website.user}`).emit('website:hacked', {
      website: website._id, domain: website.domain, threatScore: score,
      incidentId: incident._id, primaryThreat: primary.threatType,
    });
  }

  // Evidence screenshot (background, never blocks alerting)
  try {
    require('./screenshotService').captureAndCompare(website, null, { evidence: true }).catch(() => {});
  } catch {}

  logger.warn(`HACK DETECTED: ${website.domain} — Score: ${score} — Threats: ${threats.map((t) => t.threatType).join(', ')}`);
  return incident;
}

async function autoResolveIncident(website, io) {
  const inc = await IncidentLog.findOne({ website: website._id, status: { $in: OPEN_STATUSES } });
  if (!inc) return;
  await IncidentLog.updateOne({ _id: inc._id }, {
    status: 'resolved', resolutionTime: new Date(), resolution: 'Auto-resolved: clean scan',
    $push: { timeline: { event: 'auto_resolved', description: 'Threats no longer detected', timestamp: new Date() } },
  });
  await Notification.create({
    user: website.user, website: website._id, type: 'info', severity: 'low',
    title: `Recovered: ${website.domain}`, message: 'No threats detected in latest scan — incident closed automatically',
    channels: { inApp: { sent: true } },
  }).catch(() => {});
  if (io) io.to(`user:${website.user}`).emit('website:restored', { website: website._id, domain: website.domain });
}

// Re-alert unacknowledged incidents (every ESCALATE_MINUTES, up to ESCALATE_MAX times)
async function escalateOpenIncidents(io) {
  const every = num(process.env.ESCALATE_MINUTES, 10);
  const max = num(process.env.ESCALATE_MAX, 4);
  const due = await IncidentLog.find({
    status: 'open', alertCount: { $lt: max }, lastAlertAt: { $lt: new Date(Date.now() - every * 60000) },
  }).populate('website', 'domain user threatScore isActive').limit(50);

  for (const inc of due) {
    try {
      if (!inc.website || inc.website.isActive === false) continue;
      const threats = await ThreatLog.find({ _id: { $in: inc.relatedThreats }, isResolved: false }).lean();
      if (!threats.length) continue;
      await notificationService.sendHackAlert({
        website: inc.website, incident: inc, threats,
        threatScore: inc.website.threatScore || 90, reminder: inc.alertCount, escalate: inc.alertCount >= 2,
      });
      await IncidentLog.updateOne({ _id: inc._id }, {
        $inc: { alertCount: 1 }, lastAlertAt: new Date(),
        $push: { timeline: { event: 'reminder_sent', description: `Reminder #${inc.alertCount} sent (not acknowledged)`, timestamp: new Date() } },
      });
      if (io) io.to(`user:${inc.website.user}`).emit('website:hacked', { website: inc.website._id, domain: inc.website.domain, incidentId: inc._id, reminder: true });
    } catch (err) {
      logger.error(`Escalation error: ${err.message}`);
    }
  }
}

module.exports = {
  analyzeWebsite, analyzeCloaking, saveThreatResults, escalateOpenIncidents,
  scanVulnerabilities: guard.scanVulnerabilities,
};
