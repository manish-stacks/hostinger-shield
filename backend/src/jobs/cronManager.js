const cron = require('node-cron');
const logger = require('../utils/logger');
const { Website } = require('../models');

// Lazy-load services to avoid circular deps at startup
const getServices = () => ({
  threatService:     require('../services/threatService'),
  monitoringService: require('../services/monitoringService'),
  sslService:        require('../services/sslService'),
  dnsService:        require('../services/dnsService'),
  screenshotService: require('../services/screenshotService'),
  syncService:       require('../services/hostingerSyncService'),
  reportService:     require('../services/reportService'),
  backupService:     require('../services/backupService').backupService,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Helpers: overlap lock + bounded concurrency ─────────────────────────────
const running = new Set();
async function locked(name, fn) {
  if (running.has(name)) { logger.warn(`[CRON] ${name} still running — skipped`); return; }
  running.add(name);
  const t0 = Date.now();
  try { await fn(); logger.info(`[CRON] ${name} done in ${Math.round((Date.now() - t0) / 1000)}s`); }
  catch (err) { logger.error(`[CRON] ${name} error: ${err.message}`); }
  finally { running.delete(name); }
}
const activeSites = () => Website.find({ isActive: true, isMonitoringEnabled: true }).lean();
async function pool(items, size, worker) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      try { await worker(item); }
      catch (e) { logger.error(`[CRON] ${item.domain}: ${e.message}`); }
    }
  }));
}

let io;

function initCronJobs(socketIO) {
  io = socketIO;
  logger.info('Initializing cron jobs...');

  // ── Schedules (minutes configurable via .env) ────────────────────────────
  const HEALTH_MIN = Math.max(1, parseInt(process.env.HEALTH_CHECK_MINUTES) || 5);
  const FAST_MIN   = Math.max(1, parseInt(process.env.FAST_SCAN_MINUTES) || 10);

  // Health checks (up/down) — every HEALTH_MIN minutes
  cron.schedule(`*/${HEALTH_MIN} * * * *`, () => locked('health', async () => {
    const { monitoringService } = getServices();
    const sites = await activeSites();
    await pool(sites, 25, (site) => monitoringService.checkWebsite(site));
  }));

  // Fast hack scan (homepage content, redirects, hidden injections) — every FAST_MIN minutes
  cron.schedule(`*/${FAST_MIN} * * * *`, () => locked('fast-scan', async () => {
    const { threatService } = getServices();
    const sites = await activeSites();
    await pool(sites, 15, async (site) => {
      const results = await threatService.analyzeWebsite(site, { mode: 'light' });
      await threatService.saveThreatResults(site, results, io);
    });
  }));

  // Cloaking check (Googlebot / mobile-from-Google view) — hourly
  cron.schedule('20 * * * *', () => locked('cloaking', async () => {
    const { threatService } = getServices();
    const sites = await activeSites();
    await pool(sites, 8, async (site) => {
      const results = await threatService.analyzeCloaking(site);
      await threatService.saveThreatResults(site, results, io);
    });
  }));

  // Deep scan (vulnerabilities, WordPress users/plugins/sitemap, blacklists) — daily 1 AM
  cron.schedule('0 1 * * *', () => locked('deep-scan', async () => {
    const { threatService } = getServices();
    const guard = require('../services/guardService');
    const sites = await activeSites();
    const gsb = await guard.safeBrowsingBatch(sites); // one API call per 500 sites
    await pool(sites, 8, async (site) => {
      const results = await threatService.analyzeWebsite(site, { mode: 'full' });
      const flagged = gsb.get(String(site._id));
      if (flagged && !results.error) {
        results.threats.push(...flagged);
        results.isHacked = true;
      }
      await threatService.saveThreatResults(site, results, io);
    });
  }));

  // Incident reminders (unacknowledged → re-alert, then escalation contact) — every 5 min
  cron.schedule('*/5 * * * *', () => locked('escalation', async () => {
    await getServices().threatService.escalateOpenIncidents(io);
  }));

  // ── Every 6 hours: Hostinger account sync ───────────────────────────────────
  cron.schedule('0 */6 * * *', async () => {
    logger.info('[CRON] Hostinger sync starting');
    try {
      const { syncService } = getServices();
      await syncService.syncAllAccounts();
      logger.info('[CRON] Hostinger sync done');
    } catch (err) {
      logger.error(`[CRON] Hostinger sync error: ${err.message}`);
    }
  });

  // ── Daily 2 AM: Screenshots (single shared browser) ─────────────────────────
  cron.schedule('0 2 * * *', async () => {
    logger.info('[CRON] Screenshots starting');
    try {
      const { screenshotService } = getServices();
      await screenshotService.captureAllWebsites();
      logger.info('[CRON] Screenshots done');
    } catch (err) {
      logger.error(`[CRON] Screenshots error: ${err.message}`);
    }
  });

  // ── Daily 3 AM: SSL checks ───────────────────────────────────────────────────
  cron.schedule('0 3 * * *', async () => {
    logger.info('[CRON] SSL checks starting');
    try {
      const { sslService } = getServices();
      const websites = await Website.find({ isActive: true }).lean();
      for (const site of websites) {
        await sslService.checkAndSave(site).catch((e) =>
          logger.error(`SSL check failed for ${site.domain}: ${e.message}`)
        );
        await sleep(1000);
      }
      logger.info('[CRON] SSL checks done');
    } catch (err) {
      logger.error(`[CRON] SSL check error: ${err.message}`);
    }
  });

  // ── Daily 4 AM: DNS monitoring ───────────────────────────────────────────────
  cron.schedule('0 4 * * *', async () => {
    logger.info('[CRON] DNS monitoring starting');
    try {
      const { dnsService } = getServices();
      const websites = await Website.find({ isActive: true }).lean();
      for (const site of websites) {
        await dnsService.checkAndSave(site).catch((e) =>
          logger.error(`DNS check failed for ${site.domain}: ${e.message}`)
        );
        await sleep(500);
      }
      logger.info('[CRON] DNS monitoring done');
    } catch (err) {
      logger.error(`[CRON] DNS monitoring error: ${err.message}`);
    }
  });

  // ── Daily 5 AM: Backup discovery ─────────────────────────────────────────────
  cron.schedule('0 5 * * *', async () => {
    logger.info('[CRON] Backup discovery starting');
    try {
      const { backupService } = getServices();
      const websites = await Website.find({ isActive: true }).lean();
      for (const site of websites) {
        await backupService.discoverAllBackups(site._id).catch((e) =>
          logger.error(`Backup discovery failed for ${site.domain}: ${e.message}`)
        );
      }
      logger.info('[CRON] Backup discovery done');
    } catch (err) {
      logger.error(`[CRON] Backup discovery error: ${err.message}`);
    }
  });

  // ── Daily 8 AM: Report generation ────────────────────────────────────────────
  cron.schedule('0 8 * * *', async () => {
    logger.info('[CRON] Daily report generation starting');
    try {
      const { reportService } = getServices();
      await reportService.generateDailySummary();
      logger.info('[CRON] Daily report done');
    } catch (err) {
      logger.error(`[CRON] Report generation error: ${err.message}`);
    }
  });

  // ── Daily 6 AM: Auto-delete old data (keeps DB/disk from filling) ───────────
  const runCleanup = async () => {
    try {
      await require('../services/cleanupService').runAll();
    } catch (err) {
      logger.error(`[CRON] Cleanup error: ${err.message}`);
    }
  };
  cron.schedule('0 6 * * *', runCleanup);
  // Also once shortly after startup, then every 6h if DB is over the size limit
  setTimeout(runCleanup, 60 * 1000);
  cron.schedule('0 */6 * * *', async () => {
    try { await require('../services/cleanupService').runIfOverLimit(); } catch {}
  });

  logger.info('All cron jobs initialized');
}

module.exports = { initCronJobs };
