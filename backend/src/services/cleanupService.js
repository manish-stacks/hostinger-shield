const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const {
  WebsiteHealth, ThreatLog, SSLLog, DNSLog, ScreenshotLog,
  IncidentLog, Notification, Report,
} = require('../models');
const logger = require('../utils/logger');

const num = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

// Retention in days & per-site caps (override via .env)
const R = () => ({
  health:         num(process.env.RETAIN_HEALTH_DAYS, 7),
  threatResolved: num(process.env.RETAIN_THREAT_RESOLVED_DAYS, 14),
  threatOpen:     num(process.env.RETAIN_THREAT_OPEN_DAYS, 60),
  ssl:            num(process.env.RETAIN_SSL_DAYS, 30),
  dns:            num(process.env.RETAIN_DNS_DAYS, 30),
  incident:       num(process.env.RETAIN_INCIDENT_DAYS, 45),
  notifRead:      num(process.env.RETAIN_NOTIF_READ_DAYS, 3),
  notifAll:       num(process.env.RETAIN_NOTIF_DAYS, 10),
  screenshot:     num(process.env.RETAIN_SCREENSHOT_LOG_DAYS, 7),
  evidence:       num(process.env.RETAIN_EVIDENCE_DAYS, 14),
  report:         num(process.env.RETAIN_REPORT_DAYS, 21),
  files:          num(process.env.RETAIN_FILES_DAYS, 14),
  maxHealthSite:  Math.max(5, num(process.env.MAX_HEALTH_PER_SITE, 48)),
  maxSslSite:     Math.max(1, num(process.env.MAX_SSL_PER_SITE, 5)),
  maxDnsSite:     Math.max(1, num(process.env.MAX_DNS_PER_SITE, 10)),
  maxShotSite:    Math.max(1, num(process.env.SCREENSHOT_KEEP_LATEST, 2)),
  dbMaxMb:        num(process.env.DB_MAX_MB, 380),
});

const ago = (days) => new Date(Date.now() - days * 86400000);
const toMB = (bytes) => Number(((bytes || 0) / 1048576).toFixed(2));

// Latest record id per website — never deleted, so pages always show current state
async function latestIds(Model, dateField) {
  const rows = await Model.aggregate([
    { $sort: { [dateField]: -1 } },
    { $group: { _id: '$website', id: { $first: '$_id' } } },
  ]).allowDiskUse(true);
  return rows.map((r) => r.id);
}

// Keep at most `maxKeep` latest documents per website — mathematically bounds collection growth
async function capPerWebsite(label, Model, dateField, maxKeep, extraMatch = {}) {
  try {
    const groups = await Model.aggregate([
      ...(Object.keys(extraMatch).length ? [{ $match: extraMatch }] : []),
      { $sort: { [dateField]: -1 } },
      { $group: { _id: '$website', ids: { $push: '$_id' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: maxKeep } } },
    ]).allowDiskUse(true);

    const toDelete = [];
    for (const g of groups) {
      toDelete.push(...g.ids.slice(maxKeep));
    }

    if (!toDelete.length) return 0;

    // Delete in batches of 2000 to avoid oversized BSON queries
    let deletedTotal = 0;
    for (let i = 0; i < toDelete.length; i += 2000) {
      const batch = toDelete.slice(i, i + 2000);
      const { deletedCount } = await Model.deleteMany({ _id: { $in: batch } });
      deletedTotal += deletedCount || 0;
    }

    if (deletedTotal) logger.info(`[Cleanup] cap ${label} (max ${maxKeep}/site): removed ${deletedTotal}`);
    return deletedTotal;
  } catch (err) {
    logger.error(`[Cleanup] cap ${label} failed: ${err.message}`);
    return 0;
  }
}

async function purge(label, Model, filter, keepIds = null) {
  try {
    const f = keepIds?.length ? { ...filter, _id: { $nin: keepIds } } : filter;
    const { deletedCount } = await Model.deleteMany(f);
    if (deletedCount) logger.info(`[Cleanup] ${label}: removed ${deletedCount}`);
    return deletedCount || 0;
  } catch (err) {
    logger.error(`[Cleanup] ${label} failed: ${err.message}`);
    return 0;
  }
}

async function cleanFiles(dir, days, { onlyOrphans = false, referenced = new Set() } = {}) {
  let removed = 0;
  try {
    if (!fs.existsSync(dir)) return 0;
    const cutoff = Date.now() - days * 86400000;
    for (const f of await fs.promises.readdir(dir)) {
      const fp = path.join(dir, f);
      try {
        const st = await fs.promises.stat(fp);
        if (!st.isFile()) continue;
        if (onlyOrphans && referenced.has(fp)) continue;
        if (st.mtimeMs < cutoff) {
          await fs.promises.unlink(fp);
          removed++;
        }
      } catch {}
    }
  } catch (err) {
    logger.error(`[Cleanup] files ${dir}: ${err.message}`);
  }
  if (removed) logger.info(`[Cleanup] ${dir}: removed ${removed} files`);
  return removed;
}

// Live MongoDB size + per-collection breakdown (ideal for Atlas 512MB monitoring)
async function getDatabaseStats() {
  if (mongoose.connection.readyState !== 1) {
    return { connected: false, collections: [] };
  }

  const db = mongoose.connection.db;
  const stats = await db.stats();
  const r = R();

  const dataSizeMB    = toMB(stats.dataSize);
  const indexSizeMB   = toMB(stats.indexSize);
  const storageSizeMB = toMB(stats.storageSize);
  const logicalMB     = Number((dataSizeMB + indexSizeMB).toFixed(2));
  const usedMB        = Math.max(logicalMB, storageSizeMB);
  const limitMB       = r.dbMaxMb || 512;
  const usagePercent  = limitMB > 0 ? Math.min(100, Math.round((usedMB / limitMB) * 100)) : 0;

  const colInfos = await db.listCollections().toArray();
  const collections = [];
  for (const col of colInfos) {
    try {
      const agg = await db.collection(col.name).aggregate([
        { $collStats: { storageStats: {} } },
      ]).toArray();
      const s = agg[0]?.storageStats || {};
      collections.push({
        name: col.name,
        count: s.count || 0,
        sizeMB: toMB(s.size),
        storageMB: toMB(s.storageSize),
        indexMB: toMB(s.totalIndexSize),
      });
    } catch {
      const count = await db.collection(col.name).estimatedDocumentCount().catch(() => 0);
      collections.push({ name: col.name, count, sizeMB: 0, storageMB: 0, indexMB: 0 });
    }
  }
  collections.sort((a, b) => (b.sizeMB + b.indexMB) - (a.sizeMB + a.indexMB));

  return {
    connected: true,
    dbName: db.databaseName,
    dataSizeMB,
    indexSizeMB,
    storageSizeMB,
    usedMB,
    limitMB,
    usagePercent,
    status: usagePercent >= 85 ? 'critical' : usagePercent >= 65 ? 'warning' : 'healthy',
    retention: {
      healthDays: r.health,
      maxHealthPerSite: r.maxHealthSite,
      notifDays: r.notifAll,
      threatResolvedDays: r.threatResolved,
      sslDays: r.ssl,
      dnsDays: r.dns,
      screenshotKeepLatest: r.maxShotSite,
    },
    collections,
  };
}

// factor < 1 shortens retention & per-site caps (used when DB approaches its size limit)
async function runAll(factor = 1) {
  const r = R();
  const d = (n) => ago(Math.max(1, Math.round(n * factor)));
  const cap = (n) => Math.max(2, Math.round(n * factor));

  logger.info(`[Cleanup] Starting (factor ${factor})`);
  const deleted = {};

  // 1. WebsiteHealth: time-based purge + per-site rolling cap
  deleted.healthTime = await purge('health (age)', WebsiteHealth, { checkedAt: { $lt: d(r.health) } });
  deleted.healthCap  = await capPerWebsite('health', WebsiteHealth, 'checkedAt', cap(r.maxHealthSite));

  // 2. ThreatLogs
  deleted.threatsResolved = await purge('threats resolved', ThreatLog, { isResolved: true, detectedAt: { $lt: d(r.threatResolved) } });
  deleted.threatsOpen     = await purge('threats open', ThreatLog, { detectedAt: { $lt: d(r.threatOpen) } });

  // 3. SSLLogs: time-based + per-site cap (always keep latest)
  deleted.sslTime = await purge('ssl (age)', SSLLog, { checkedAt: { $lt: d(r.ssl) } }, await latestIds(SSLLog, 'checkedAt'));
  deleted.sslCap  = await capPerWebsite('ssl', SSLLog, 'checkedAt', Math.max(1, cap(r.maxSslSite)));

  // 4. DNSLogs: drop unchanged snapshots sooner + per-site cap
  deleted.dnsUnchanged = await purge('dns unchanged', DNSLog, { hasChanged: { $ne: true }, checkedAt: { $lt: d(Math.min(r.dns, 14)) } }, await latestIds(DNSLog, 'checkedAt'));
  deleted.dnsChanged   = await purge('dns changed', DNSLog, { checkedAt: { $lt: d(r.dns) } }, await latestIds(DNSLog, 'checkedAt'));
  deleted.dnsCap       = await capPerWebsite('dns', DNSLog, 'checkedAt', Math.max(2, cap(r.maxDnsSite)));

  // 5. Incidents (only resolved/closed)
  deleted.incidents = await purge('incidents', IncidentLog, {
    status: { $in: ['resolved', 'closed'] },
    $or: [{ resolutionTime: { $lt: d(r.incident) } }, { resolutionTime: null, updatedAt: { $lt: d(r.incident) } }],
  });

  // 6. Notifications
  deleted.notifRead = await purge('notifications read', Notification, { isRead: true, createdAt: { $lt: d(r.notifRead) } });
  deleted.notifAll  = await purge('notifications all', Notification, { createdAt: { $lt: d(r.notifAll) } });

  // 7. Screenshots: age + per-site cap + orphan file cleanup
  deleted.screenshots = await purge('screenshot logs', ScreenshotLog, { isEvidence: { $ne: true }, capturedAt: { $lt: d(r.screenshot) } }, await latestIds(ScreenshotLog, 'capturedAt'));
  deleted.evidence    = await purge('evidence screenshots', ScreenshotLog, { isEvidence: true, capturedAt: { $lt: d(r.evidence) } });
  deleted.shotCap     = await capPerWebsite('screenshots', ScreenshotLog, 'capturedAt', Math.max(1, r.maxShotSite), { isEvidence: { $ne: true } });

  const shotDir = process.env.SCREENSHOT_DIR || path.join(__dirname, '../../screenshots');
  const keep = new Set(
    (await ScreenshotLog.find({ screenshotPath: { $ne: null } }).select('screenshotPath').lean()).map((x) => x.screenshotPath)
  );
  deleted.orphanScreenshotFiles = await cleanFiles(shotDir, 0, { onlyOrphans: true, referenced: keep });

  // 8. Reports + export files
  const oldReports = await Report.find({ createdAt: { $lt: d(r.report) } }).select('_id filePath').lean();
  for (const rep of oldReports) if (rep.filePath) await fs.promises.unlink(rep.filePath).catch(() => {});
  deleted.reports = oldReports.length
    ? await purge('reports', Report, { _id: { $in: oldReports.map((x) => x._id) } })
    : 0;
  deleted.exportFiles = await cleanFiles(path.join(process.cwd(), 'exports'), r.files);

  const totalDeleted = Object.values(deleted).reduce((a, b) => a + b, 0);
  logger.info(`[Cleanup] Done — removed ${totalDeleted} total items`);
  return { factor, totalDeleted, deleted };
}

// Emergency mode: progressive multi-stage cleanup if DB size exceeds DB_MAX_MB
async function runIfOverLimit(io = null) {
  const max = R().dbMaxMb;
  if (!max || mongoose.connection.readyState !== 1) return null;

  const stats = await mongoose.connection.db.stats();
  const usedMb = Math.max(stats.dataSize + stats.indexSize, stats.storageSize) / 1048576;

  if (usedMb <= max) return { overLimit: false, usedMb: Number(usedMb.toFixed(2)), max };

  logger.warn(`[Cleanup] DB ${usedMb.toFixed(1)}MB > ${max}MB limit — Stage 1 cleanup (factor 0.5)`);
  const s1 = await runAll(0.5);

  const after1 = await mongoose.connection.db.stats();
  const usedAfter1 = Math.max(after1.dataSize + after1.indexSize, after1.storageSize) / 1048576;

  if (usedAfter1 > max) {
    logger.warn(`[Cleanup] DB still ${usedAfter1.toFixed(1)}MB > ${max}MB — Stage 2 emergency cleanup`);
    await runAll(0.25);
    await purge('emergency read notifs', Notification, { isRead: true });
    await purge('emergency resolved threats', ThreatLog, { isResolved: true, detectedAt: { $lt: ago(2) } });
    await capPerWebsite('emergency health', WebsiteHealth, 'checkedAt', 12);
  }

  const finalStats = await mongoose.connection.db.stats();
  const finalMb = Number((Math.max(finalStats.dataSize + finalStats.indexSize, finalStats.storageSize) / 1048576).toFixed(2));

  if (io && finalMb > max * 0.85) {
    io.emit('db:warning', { usedMb: finalMb, maxMb: max });
  }

  return { overLimit: true, beforeMb: Number(usedMb.toFixed(2)), afterMb: finalMb, max, s1 };
}

module.exports = { runAll, runIfOverLimit, getDatabaseStats };
