const fs   = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const {
  WebsiteHealth, ThreatLog, SSLLog, DNSLog, ScreenshotLog,
  IncidentLog, Notification, Report,
} = require('../models');
const logger = require('../utils/logger');

const num = (v, d) => (Number.isFinite(parseInt(v)) ? parseInt(v) : d);

// Retention in days (override via .env)
const R = () => ({
  health:        num(process.env.RETAIN_HEALTH_DAYS, 14),
  threatResolved:num(process.env.RETAIN_THREAT_RESOLVED_DAYS, 30),
  threatOpen:    num(process.env.RETAIN_THREAT_OPEN_DAYS, 90),
  ssl:           num(process.env.RETAIN_SSL_DAYS, 30),
  dns:           num(process.env.RETAIN_DNS_DAYS, 60),
  incident:      num(process.env.RETAIN_INCIDENT_DAYS, 60),
  notifRead:     num(process.env.RETAIN_NOTIF_READ_DAYS, 7),
  notifAll:      num(process.env.RETAIN_NOTIF_DAYS, 15),
  screenshot:    num(process.env.RETAIN_SCREENSHOT_LOG_DAYS, 7),
  report:        num(process.env.RETAIN_REPORT_DAYS, 30),
  files:         num(process.env.RETAIN_FILES_DAYS, 30),
});

const ago = (days) => new Date(Date.now() - days * 86400000);

// Latest record id per website — never deleted, so pages always show current state
async function latestIds(Model, dateField) {
  const rows = await Model.aggregate([
    { $sort: { [dateField]: -1 } },
    { $group: { _id: '$website', id: { $first: '$_id' } } },
  ]);
  return rows.map((r) => r.id);
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
        if (st.mtimeMs < cutoff) { await fs.promises.unlink(fp); removed++; }
      } catch {}
    }
  } catch (err) {
    logger.error(`[Cleanup] files ${dir}: ${err.message}`);
  }
  if (removed) logger.info(`[Cleanup] ${dir}: removed ${removed} files`);
  return removed;
}

// factor < 1 shortens retention (used when DB is over its size limit)
async function runAll(factor = 1) {
  const r = R();
  const d = (n) => ago(Math.max(1, Math.round(n * factor)));
  logger.info(`[Cleanup] Starting (factor ${factor})`);

  await purge('health', WebsiteHealth, { checkedAt: { $lt: d(r.health) } });

  await purge('threats resolved', ThreatLog, { isResolved: true, detectedAt: { $lt: d(r.threatResolved) } });
  await purge('threats open', ThreatLog, { detectedAt: { $lt: d(r.threatOpen) } });

  await purge('ssl', SSLLog, { checkedAt: { $lt: d(r.ssl) } }, await latestIds(SSLLog, 'checkedAt'));
  // DNS: keep change history longer, drop unchanged snapshots sooner
  await purge('dns unchanged', DNSLog, { hasChanged: { $ne: true }, checkedAt: { $lt: d(r.ssl) } }, await latestIds(DNSLog, 'checkedAt'));
  await purge('dns changed', DNSLog, { checkedAt: { $lt: d(r.dns) } }, await latestIds(DNSLog, 'checkedAt'));

  await purge('incidents', IncidentLog, {
    status: { $in: ['resolved', 'closed'] },
    $or: [{ resolutionTime: { $lt: d(r.incident) } }, { resolutionTime: null, updatedAt: { $lt: d(r.incident) } }],
  });

  await purge('notifications read', Notification, { isRead: true, createdAt: { $lt: d(r.notifRead) } });
  await purge('notifications all', Notification, { createdAt: { $lt: d(r.notifAll) } });

  // Screenshots: DB rows without files + error rows; files handled by per-site keep-latest + orphan sweep
  await purge('screenshot logs', ScreenshotLog, { capturedAt: { $lt: d(r.screenshot) } }, await latestIds(ScreenshotLog, 'capturedAt'));
  const shotDir = process.env.SCREENSHOT_DIR || path.join(__dirname, '../../screenshots');
  const keep = new Set((await ScreenshotLog.find({ screenshotPath: { $ne: null } }).select('screenshotPath').lean()).map((x) => x.screenshotPath));
  await cleanFiles(shotDir, 1, { onlyOrphans: true, referenced: keep });

  // Reports + export files
  const oldReports = await Report.find({ createdAt: { $lt: d(r.report) } }).select('_id filePath').lean();
  for (const rep of oldReports) if (rep.filePath) await fs.promises.unlink(rep.filePath).catch(() => {});
  if (oldReports.length) await purge('reports', Report, { _id: { $in: oldReports.map((x) => x._id) } });
  await cleanFiles(path.join(process.cwd(), 'exports'), r.files);

  logger.info('[Cleanup] Done');
}

// Emergency mode: if DB data size exceeds DB_MAX_MB, purge with half retention
async function runIfOverLimit() {
  const max = num(process.env.DB_MAX_MB, 0);
  if (!max || mongoose.connection.readyState !== 1) return;
  const stats = await mongoose.connection.db.stats();
  const usedMb = (stats.dataSize + stats.indexSize) / 1048576;
  if (usedMb > max) {
    logger.warn(`[Cleanup] DB ${Math.round(usedMb)}MB > ${max}MB limit — aggressive cleanup`);
    await runAll(0.5);
  }
}

module.exports = { runAll, runIfOverLimit };
