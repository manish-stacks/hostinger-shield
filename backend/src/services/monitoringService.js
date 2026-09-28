const axios = require('axios');
const https = require('https');
const dns = require('dns').promises;
const tls = require('tls');
const { Website, WebsiteHealth, Notification } = require('../models');
const notificationService = require('./notificationService');

const TIMEOUT = parseInt(process.env.MONITOR_TIMEOUT_MS) || 15000;

class MonitoringService {
  async checkWebsite(website) {
    const result = {
      website: website._id,
      domain: website.domain,
      checkedAt: new Date(),
      httpStatus: null,
      httpsStatus: null,
      responseTime: null,
      redirectChain: [],
      finalUrl: null,
      isUp: false,
      isSlow: false,
      hasRedirectIssue: false,
      dnsResolved: false,
      ipAddress: null,
      error: null,
    };

    const start = Date.now();

    // DNS resolution
    try {
      const addresses = await dns.resolve4(website.domain);
      result.dnsResolved = true;
      result.ipAddress = addresses[0] || null;
    } catch (err) {
      result.dnsResolved = false;
      result.error = `DNS failed: ${err.message}`;
    }

    if (!result.dnsResolved) {
      await this._saveHealth(result, website);
      await this._handleAlerts(result, website);
      return result;
    }

    // HTTP check
    try {
      const httpRes = await axios.get(`http://${website.domain}`, {
        timeout: TIMEOUT,
        maxRedirects: 0,
        validateStatus: () => true,
      });
      result.httpStatus = httpRes.status;
    } catch (err) {
      result.httpStatus = 0;
    }

    // HTTPS check with redirect chain (one retry before declaring the site down)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const chain = [];
        let currentUrl = `https://${website.domain}`;
        let maxRedirects = 10;
        let lastStatus = null;

        while (maxRedirects-- > 0) {
          const res = await axios.get(currentUrl, {
            timeout: TIMEOUT,
            maxRedirects: 0,
            validateStatus: () => true,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          });

          lastStatus = res.status;
          chain.push({ url: currentUrl, status: res.status });

          if (res.status >= 300 && res.status < 400 && res.headers.location) {
            const next = res.headers.location;
            currentUrl = next.startsWith('http') ? next : new URL(next, currentUrl).toString();
          } else {
            break;
          }
        }

        result.httpsStatus = lastStatus;
        result.redirectChain = chain;
        result.finalUrl = currentUrl;
        result.responseTime = Date.now() - start;
        result.isUp = lastStatus >= 200 && lastStatus < 400;
        result.isSlow = result.responseTime > 5000;
        result.hasRedirectIssue = this._detectRedirectIssue(chain, website.domain);
        result.error = null;
      } catch (err) {
        result.httpsStatus = 0;
        result.responseTime = Date.now() - start;
        result.error = err.message;
      }
      if (result.isUp || (result.httpsStatus > 0 && result.httpsStatus < 500 && result.httpsStatus !== 429)) break;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 5000));
    }

    await this._saveHealth(result, website);
    await this._handleAlerts(result, website);

    return result;
  }

  _detectRedirectIssue(chain, domain) {
    if (chain.length === 0) return false;
    const finalUrl = chain[chain.length - 1]?.url || '';
    const suspicious = [
      /casino/i, /gambling/i, /bet\d/i, /pharma/i,
      /viagra/i, /loan/i, /crypto/i, /adult/i,
    ];
    return suspicious.some((rx) => rx.test(finalUrl)) && !finalUrl.includes(domain);
  }

  async _saveHealth(result, website) {
    const prevStatus = website.status;
    const now = new Date();

    // Store a health document only when it matters (saves DB space at 5-min checks):
    // failures, status flips, slow responses, or at most once per HEALTH_SAVE_MINUTES
    const saveEvery = (parseInt(process.env.HEALTH_SAVE_MINUTES) || 30) * 60000;
    const lastSaved = website.lastHealthSave ? new Date(website.lastHealthSave).getTime() : 0;
    const flipped = (prevStatus === 'down') !== !result.isUp;
    const shouldSave = !result.isUp || result.isSlow || flipped || now.getTime() - lastSaved >= saveEvery;

    if (shouldSave) {
      await WebsiteHealth.create({
        website: website._id,
        httpStatus: result.httpStatus,
        httpsStatus: result.httpsStatus,
        responseTime: result.responseTime,
        redirectChain: (result.redirectChain || []).map((r) => (typeof r === 'string' ? r : `${r.url} [${r.status}]`)),
        finalUrl: result.finalUrl,
        isUp: result.isUp,
        isSlow: result.isSlow,
        hasRedirectIssue: result.hasRedirectIssue,
        dnsResolved: result.dnsResolved,
        ipAddress: result.ipAddress,
        error: result.error,
        checkedAt: result.checkedAt,
      });
    }

    // Never overwrite 'hacked'/'warning' set by the threat scanner with 'healthy'
    let newStatus;
    if (!result.isUp) newStatus = 'down';
    else if (prevStatus === 'down' || prevStatus === 'unknown' || !prevStatus) {
      newStatus = website.threatLevel === 'critical' || website.threatLevel === 'high_risk' ? 'hacked'
        : website.threatLevel === 'warning' ? 'warning' : 'healthy';
    } else newStatus = prevStatus;

    await Website.findByIdAndUpdate(website._id, {
      status: newStatus,
      lastScanDate: now,
      responseTime: result.responseTime,
      ipAddress: result.ipAddress,
      ...(shouldSave ? { lastHealthSave: now } : {}),
    });

    return { prevStatus, newStatus };
  }

  async _handleAlerts(result, website) {
    const prevStatus = website.status;
    const newStatus = result.isUp ? 'healthy' : 'down';

    if (prevStatus !== 'down' && newStatus === 'down') {
      await notificationService.sendDownAlert({ website, httpStatus: result.httpStatus, responseTime: result.responseTime });
      global.__io?.to(`user:${website.user}`).emit('website:down', { website: website._id, domain: website.domain });
    }
    if (prevStatus === 'down' && newStatus === 'healthy') {
      await notificationService.sendGenericAlert({
        website, type: 'info', severity: 'low',
        title: `Back online: ${website.domain}`,
        message: `Site is responding again (HTTP ${result.httpsStatus}, ${result.responseTime}ms)`,
      }).catch(() => {});
    }

    if (result.hasRedirectIssue) {
      // Dedupe: one redirect alert per site per 24h (was: every 15-min check)
      const recent = await Notification.findOne({
        website: website._id,
        type: 'threat',
        title: { $regex: '^Suspicious Redirect' },
        createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
      }).select('_id').lean();
      if (!recent && website.user) {
        await Notification.create({
          user: website.user,
          website: website._id,
          type: 'threat',
          title: `Suspicious Redirect: ${website.domain}`,
          message: 'Suspicious redirect chain detected — possible hack',
          severity: 'high',
          channels: { inApp: { sent: true } },
        });
      }
    }
  }

  async runBatch(batchSize = 25) {
    const websites = await Website.find({ isActive: true }).lean();
    const results = [];

    for (let i = 0; i < websites.length; i += batchSize) {
      const batch = websites.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((w) => this.checkWebsite(w))
      );
      results.push(...batchResults);

      if (i + batchSize < websites.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return results;
  }
}

module.exports = new MonitoringService();