const puppeteer = require('puppeteer');
const crypto    = require('crypto');
const fs        = require('fs');
const path      = require('path');
const { Website, ScreenshotLog } = require('../models');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

const SCREENSHOTS_DIR   = process.env.SCREENSHOT_DIR || path.join(process.cwd(), 'screenshots');
const KEEP_LATEST_N     = parseInt(process.env.SCREENSHOT_KEEP_LATEST) || 3;
const DELETE_AFTER_DAYS = parseInt(process.env.SCREENSHOT_DELETE_DAYS)  || 30;
const TIMEOUT_MS        = parseInt(process.env.SCREENSHOT_TIMEOUT_MS)   || 25000;
const CHANGE_THRESHOLD  = parseInt(process.env.SCREENSHOT_CHANGE_PCT)   || 15;

const DEFACEMENT_KEYWORDS = [
  'hacked', 'owned', 'pwned', 'defaced', 'h4ck', 'by_',
  'greetz', 'r00t', 'xploited', 'cracked by', 'haxor',
];

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  logger.info(`[Screenshot] Created dir: ${SCREENSHOTS_DIR}`);
}

class ScreenshotService {

  async _launch() {
    return puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1280,800',
      ],
    });
  }

  async _capture(browser, website) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      const url = `https://${website.domain}`;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS });

      const pageTitle = await page.title().catch(() => '');
      const finalUrl  = page.url();

      const slug      = website.domain.replace(/[^a-z0-9]/gi, '_');
      const timestamp = Date.now();
      const filename  = `${slug}_${timestamp}.jpg`;
      const filepath  = path.join(SCREENSHOTS_DIR, filename);

      await page.screenshot({ path: filepath, type: 'jpeg', quality: 75, fullPage: false });

      const buffer = fs.readFileSync(filepath);
      const hash   = crypto.createHash('md5').update(buffer).digest('hex');

      return { filepath, filename, pageTitle, finalUrl, hash, error: null };
    } catch (err) {
      return { filepath: null, filename: null, pageTitle: null, finalUrl: null, hash: null, error: err.message };
    } finally {
      await page.close().catch(() => {});
    }
  }

  _estimateChange(hashA, hashB) {
    if (!hashA || !hashB) return hashA !== hashB ? 100 : 0;
    if (hashA === hashB) return 0;
    return 50;
  }

  _isDefaced(pageTitle, finalUrl, domain) {
    const checkStr = `${pageTitle} ${finalUrl}`.toLowerCase();
    if (DEFACEMENT_KEYWORDS.some((kw) => checkStr.includes(kw))) return true;
    try {
      const finalHost = new URL(finalUrl).hostname.replace(/^www\./, '');
      const origHost  = domain.replace(/^www\./, '');
      if (!finalHost.includes(origHost) && !origHost.includes(finalHost)) return true;
    } catch {}
    return false;
  }

  async _cleanup(websiteId, domain) {
    try {
      const slug = domain.replace(/[^a-z0-9]/gi, '_');

      // Keep only latest N per website
      const allLogs = await ScreenshotLog.find({ website: websiteId, screenshotPath: { $ne: null } })
        .sort({ capturedAt: -1 })
        .lean();

      const toDelete = allLogs.slice(KEEP_LATEST_N);
      for (const log of toDelete) {
        if (log.screenshotPath && fs.existsSync(log.screenshotPath)) {
          fs.unlinkSync(log.screenshotPath);
        }
        await ScreenshotLog.findByIdAndDelete(log._id);
      }

      // Hard cutoff: delete files older than DELETE_AFTER_DAYS
      const cutoff = Date.now() - DELETE_AFTER_DAYS * 86400000;
      const files  = fs.readdirSync(SCREENSHOTS_DIR).filter((f) => f.startsWith(slug));
      for (const file of files) {
        const fp   = path.join(SCREENSHOTS_DIR, file);
        const stat = fs.statSync(fp);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(fp);
          logger.info(`[Screenshot] Deleted old file: ${file}`);
        }
      }
    } catch (err) {
      logger.error(`[Screenshot] Cleanup error for ${domain}: ${err.message}`);
    }
  }

  async captureAndCompare(website, browser = null) {
    const ownBrowser = !browser;
    if (ownBrowser) browser = await this._launch();

    try {
      const capture = await this._capture(browser, website);

      if (capture.error) {
        await ScreenshotLog.create({ website: website._id, capturedAt: new Date(), error: capture.error });
        return { success: false, error: capture.error };
      }

      const previous = await ScreenshotLog.findOne({
        website: website._id,
        error: null,
        hash: { $exists: true },
      }).sort({ capturedAt: -1 }).lean();

      const changePercent = this._estimateChange(previous?.hash, capture.hash);
      const hasChanged    = changePercent >= CHANGE_THRESHOLD;
      const isDefaced     = this._isDefaced(capture.pageTitle, capture.finalUrl, website.domain);

      await ScreenshotLog.create({
        website:        website._id,
        capturedAt:     new Date(),
        screenshotPath: capture.filepath,
        screenshotUrl:  null,
        hasChanged,
        changePercent,
        isDefaced,
        pageTitle:      capture.pageTitle,
        hash:           capture.hash,
        error:          null,
      });

      if (isDefaced || hasChanged) {
        await notificationService.createNotification?.({
          user:     website.user,
          website:  website._id,
          type:     'threat',
          title:    isDefaced ? '🚨 Defacement Detected' : '⚠️ Visual Change Detected',
          message:  isDefaced
            ? `${website.domain} may be defaced`
            : `${website.domain} visual change detected (${changePercent}%)`,
          severity: isDefaced ? 'critical' : 'high',
        }).catch(() => {});
      }

      await Website.findByIdAndUpdate(website._id, { lastScreenshot: new Date() });
      await this._cleanup(website._id, website.domain);

      return { success: true, hasChanged, isDefaced, changePercent };
    } finally {
      if (ownBrowser) await browser.close().catch(() => {});
    }
  }

  async captureAllWebsites() {
    const websites = await Website.find({ isActive: true, isMonitoringEnabled: true }).lean();
    logger.info(`[Screenshot] Starting batch for ${websites.length} websites`);

    const browser = await this._launch();
    const results = [];

    try {
      for (const site of websites) {
        try {
          const result = await this.captureAndCompare(site, browser);
          results.push({ domain: site.domain, ...result });
        } catch (e) {
          results.push({ domain: site.domain, success: false, error: e.message });
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      await browser.close().catch(() => {});
    }

    const ok     = results.filter((r) => r.success).length;
    const errors = results.filter((r) => !r.success).map((r) => `${r.domain}: ${r.error}`);
    logger.info(`[Screenshot] Batch done — ${ok}/${websites.length} ok, ${errors.length} errors`);
    return { processed: ok, errors };
  }
}

module.exports = new ScreenshotService();