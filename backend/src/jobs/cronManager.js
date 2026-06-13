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

let io;

function initCronJobs(socketIO) {
  io = socketIO;
  logger.info('Initializing cron jobs...');

  // ── Every 15 min: Health checks ─────────────────────────────────────────────
  cron.schedule('*/15 * * * *', async () => {
    logger.info('[CRON] Health checks starting');
    try {
      const { monitoringService } = getServices();
      const websites = await Website.find({ isActive: true, isMonitoringEnabled: true }).lean();
      const batchSize = 20;
      for (let i = 0; i < websites.length; i += batchSize) {
        const batch = websites.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map((site) =>
            monitoringService.checkWebsite(site).catch((e) =>
              logger.error(`Health check failed for ${site.domain}: ${e.message}`)
            )
          )
        );
        if (i + batchSize < websites.length) await sleep(2000);
      }
      logger.info(`[CRON] Health checks done for ${websites.length} websites`);
    } catch (err) {
      logger.error(`[CRON] Health check error: ${err.message}`);
    }
  });

  // ── Every 30 min: Threat detection ──────────────────────────────────────────
  cron.schedule('*/30 * * * *', async () => {
    logger.info('[CRON] Threat detection starting');
    try {
      const { threatService } = getServices();
      const websites = await Website.find({ isActive: true, isMonitoringEnabled: true }).lean();
      const batchSize = 10;
      for (let i = 0; i < websites.length; i += batchSize) {
        const batch = websites.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map(async (site) => {
            try {
              const results = await threatService.analyzeWebsite(site);
              await threatService.saveThreatResults(site, results, io);
            } catch (e) {
              logger.error(`Threat scan failed for ${site.domain}: ${e.message}`);
            }
          })
        );
        if (i + batchSize < websites.length) await sleep(5000);
      }
      logger.info('[CRON] Threat detection done');
    } catch (err) {
      logger.error(`[CRON] Threat detection error: ${err.message}`);
    }
  });

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

  // ── Daily 2 AM: Screenshots ──────────────────────────────────────────────────
  cron.schedule('0 2 * * *', async () => {
    logger.info('[CRON] Screenshots starting');
    try {
      const { screenshotService } = getServices();
      const websites = await Website.find({ isActive: true, isMonitoringEnabled: true }).lean();
      for (const site of websites) {
        await screenshotService.captureAndCompare(site).catch((e) =>
          logger.error(`Screenshot failed for ${site.domain}: ${e.message}`)
        );
        await sleep(3000);
      }
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

  logger.info('All 7 cron jobs initialized');
}

module.exports = { initCronJobs };
