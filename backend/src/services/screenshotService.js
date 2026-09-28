const puppeteer = require('puppeteer');
const crypto    = require('crypto');
const fs        = require('fs');
const path      = require('path');
const { Website, ScreenshotLog } = require('../models');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

const SCREENSHOTS_DIR   = process.env.SCREENSHOT_DIR || path.join(__dirname, '../../screenshots');
const KEEP_LATEST_N     = parseInt(process.env.SCREENSHOT_KEEP_LATEST) || 2;
const DELETE_AFTER_DAYS = parseInt(process.env.SCREENSHOT_DELETE_DAYS)  || 7;
const TIMEOUT_MS        = parseInt(process.env.SCREENSHOT_TIMEOUT_MS)   || 30000;
const CHANGE_THRESHOLD  = parseInt(process.env.SCREENSHOT_CHANGE_PCT)   || 15;
const JPEG_QUALITY      = parseInt(process.env.SCREENSHOT_QUALITY)      || 60;

const DEFACEMENT_KEYWORDS = [
  'hacked', 'owned', 'pwned', 'defaced', 'h4ck', 'greetz', 'r00t',
  'xploited', 'cracked by', 'haxor', 'hacked by',
];

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/snap/bin/chromium',
].filter(Boolean);

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

function resolveChrome() {
  for (const p of CHROME_CANDIDATES) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  try {
    const p = puppeteer.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return null;
}

class ScreenshotService {

  async _launch() {
    const executablePath = resolveChrome();
    if (!executablePath) {
      throw new Error(
        'Chrome/Chromium not found on server. Install: apt-get install -y chromium (or run: npx puppeteer browsers install chrome), or set PUPPETEER_EXECUTABLE_PATH'
      );
    }
    return puppeteer.launch({
      headless: true,
      executablePath,
      timeout: 60000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--no-zygote',
        '--hide-scrollbars',
        '--mute-audio',
        '--window-size=1280,800',
      ],
    });
  }

  async _open(page, domain) {
    const opts = { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS };
    try {
      await page.goto(`https://${domain}`, opts);
    } catch (err) {
      // Fallback to http (bad/expired SSL, no https)
      if (/ERR_CERT|SSL|ERR_CONNECTION|ERR_TLS/i.test(err.message)) {
        await page.goto(`http://${domain}`, opts);
      } else {
        throw err;
      }
    }
    // Let JS/images settle, but never fail on it
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 8000 }).catch(() => {});
  }

  async _capture(browser, website) {
    let page;
    try {
      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      );
      // Skip heavy media to save time/bandwidth
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const t = req.resourceType();
        if (t === 'media' || t === 'websocket') return req.abort().catch(() => {});
        req.continue().catch(() => {});
      });

      await this._open(page, website.domain);

      const pageTitle = await page.title().catch(() => '');
      const finalUrl  = page.url();
      const bodyText  = await page.evaluate(() => (document.body?.innerText || '').slice(0, 20000)).catch(() => '');
      // Hash of visible text → stable change detection (ignores ads/JPEG noise)
      const hash = crypto.createHash('md5').update(`${pageTitle}|${bodyText.replace(/\s+/g, ' ').trim()}`).digest('hex');

      const slug     = website.domain.replace(/[^a-z0-9]/gi, '_');
      const filename = `${slug}_${Date.now()}.jpg`;
      const filepath = path.join(SCREENSHOTS_DIR, filename);

      await page.screenshot({ path: filepath, type: 'jpeg', quality: JPEG_QUALITY, fullPage: false });

      return { filepath, filename, pageTitle, finalUrl, hash, bodyText, error: null };
    } catch (err) {
      return { filepath: null, error: err.message };
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  _estimateChange(hashA, hashB) {
    if (!hashA || !hashB) return 0; // first capture → nothing to compare
    return hashA === hashB ? 0 : 50;
  }

  _isDefaced(pageTitle, finalUrl, domain, bodyText = '') {
    const checkStr = `${pageTitle} ${finalUrl}`.toLowerCase();
    if (DEFACEMENT_KEYWORDS.some((kw) => checkStr.includes(kw))) return true;
    try {
      const strip = (h) => h.replace(/^www\./, '');
      const finalHost = strip(new URL(finalUrl).hostname);
      const origHost  = strip(domain);
      const sameSite  = finalHost === origHost || finalHost.endsWith(`.${origHost}`) || origHost.endsWith(`.${finalHost}`);
      if (!sameSite) return true;
    } catch {}
    return false;
  }

  async _cleanup(websiteId) {
    try {
      const logs = await ScreenshotLog.find({ website: websiteId, screenshotPath: { $ne: null } })
        .sort({ capturedAt: -1 }).select('_id screenshotPath').lean();

      for (const log of logs.slice(KEEP_LATEST_N)) {
        if (log.screenshotPath) await fs.promises.unlink(log.screenshotPath).catch(() => {});
        await ScreenshotLog.findByIdAndDelete(log._id);
      }
    } catch (err) {
      logger.error(`[Screenshot] Cleanup error: ${err.message}`);
    }
  }

  async captureAndCompare(website, browser = null) {
    const ownBrowser = !browser;
    try {
      if (ownBrowser) browser = await this._launch();
    } catch (err) {
      logger.error(`[Screenshot] Launch failed: ${err.message}`);
      return { success: false, error: err.message };
    }

    try {
      const capture = await this._capture(browser, website);

      if (capture.error) {
        // Keep only one error record per site (avoid log spam)
        await ScreenshotLog.deleteMany({ website: website._id, error: { $ne: null } });
        await ScreenshotLog.create({ website: website._id, capturedAt: new Date(), error: capture.error });
        return { success: false, error: capture.error };
      }

      const previous = await ScreenshotLog.findOne({
        website: website._id, error: null, hash: { $exists: true, $ne: null },
      }).sort({ capturedAt: -1 }).select('hash isDefaced').lean();

      const changePercent = this._estimateChange(previous?.hash, capture.hash);
      const hasChanged    = changePercent >= CHANGE_THRESHOLD;
      const isDefaced     = this._isDefaced(capture.pageTitle, capture.finalUrl, website.domain, capture.bodyText);

      await ScreenshotLog.create({
        website:        website._id,
        capturedAt:     new Date(),
        screenshotPath: capture.filepath,
        hasChanged,
        changePercent,
        isDefaced,
        pageTitle:      capture.pageTitle,
        hash:           capture.hash,
        error:          null,
      });

      // Alert only on new defacement / change (not every run)
      if (isDefaced && !previous?.isDefaced) {
        await notificationService.createNotification({
          user: website.user, website: website._id, type: 'threat',
          title: 'Defacement Detected', message: `${website.domain} may be defaced`, severity: 'critical',
        });
      }

      await Website.findByIdAndUpdate(website._id, { lastScreenshot: new Date() });
      await this._cleanup(website._id);

      return { success: true, hasChanged, isDefaced, changePercent };
    } finally {
      if (ownBrowser) await browser.close().catch(() => {});
    }
  }

  async captureAllWebsites() {
    const websites = await Website.find({ isActive: true, isMonitoringEnabled: true }).lean();
    logger.info(`[Screenshot] Starting batch for ${websites.length} websites`);

    let browser;
    try { browser = await this._launch(); }
    catch (err) {
      logger.error(`[Screenshot] Launch failed: ${err.message}`);
      return { processed: 0, errors: [err.message] };
    }

    const results = [];
    try {
      for (let i = 0; i < websites.length; i++) {
        const site = websites[i];
        try {
          results.push({ domain: site.domain, ...(await this.captureAndCompare(site, browser)) });
        } catch (e) {
          results.push({ domain: site.domain, success: false, error: e.message });
        }
        // Restart browser periodically to prevent memory leaks on small VPS
        if ((i + 1) % 25 === 0 && i + 1 < websites.length) {
          await browser.close().catch(() => {});
          browser = await this._launch();
        }
        await new Promise((r) => setTimeout(r, 1000));
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
