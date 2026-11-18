const axios = require('axios');
const https = require('https');
const dns = require('dns').promises;
const { Website, WebsiteHealth, Notification } = require('../models');
const notificationService = require('./notificationService');

const TIMEOUT = parseInt(process.env.MONITOR_TIMEOUT_MS, 10) || 15000;
const SLOW_MS = parseInt(process.env.MONITOR_SLOW_MS, 10) || 5000;
const HEALTH_SAVE_MIN = Math.max(5, parseInt(process.env.HEALTH_SAVE_MINUTES, 10) || 60);

// Shared HTTPS agent — avoids leaking sockets/agents per request
const insecureAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: false });

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
      hasRedirect: false,
      hasRedirectIssue: false,
      dnsResolved: false,
      ipAddress: null,
      error: null,
    };

    const start = Date.now();

    // 1. DNS resolution
    try {
      const addresses = await dns.resolve4(website.domain);
      result.dnsResolved = true;
      result.ipAddress = addresses[0] || null;
    } catch (err) {
      result.dnsResolved = false;
      result.responseTime = Date.now() - start;
      result.error = `DNS failed: ${err.code || err.message}`;
    }

    if (!result.dnsResolved) {
      await this._saveHealth(result, website);
      await this._handleAlerts(result, website);
      return result;
    }

    // 2. HTTPS check with redirect chain (one retry before declaring the site down)
    for (let attempt = 0; attempt < 2; attempt++) {
      const reqStart = Date.now();
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
            httpsAgent: insecureAgent,
            headers: {
              'User-Agent': 'ShieldPro-Monitor/2.0 (+https://hostinger-shield)',
              Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
            },
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
        result.httpStatus = lastStatus;
        result.redirectChain = chain;
        result.finalUrl = currentUrl;
        result.responseTime = Date.now() - reqStart;
        result.isUp = lastStatus >= 200 && lastStatus < 400;
        result.isSlow = result.responseTime > SLOW_MS;
        result.hasRedirect = chain.length > 1;
        result.hasRedirectIssue = this._detectRedirectIssue(chain, website.domain);
        result.error = result.isUp ? null : `HTTP ${lastStatus}`;
      } catch (err) {
        result.httpsStatus = 0;
        result.responseTime = Date.now() - reqStart;
        result.error = err.code || err.message;

        // Fallback to HTTP if port 443 refused or TLS unsupported
        if (/ECONNREFUSED|ERR_TLS|WRONG_VERSION|PROTO/i.test(result.error)) {
          try {
            const httpRes = await axios.get(`http://${website.domain}`, {
              timeout: TIMEOUT,
              maxRedirects: 5,
              validateStatus: () => true,
            });
            result.httpStatus = httpRes.status;
            result.finalUrl = httpRes.request?.res?.responseUrl || `http://${website.domain}`;
            result.responseTime = Date.now() - reqStart;
            if (httpRes.status >= 200 && httpRes.status < 400) {
              result.isUp = true;
              result.isSlow = result.responseTime > SLOW_MS;
              result.error = 'HTTP only (no HTTPS)';
            }
          } catch {}
        }
      }

      if (result.isUp || (result.httpsStatus > 0 && result.httpsStatus < 500 && result.httpsStatus !== 429)) break;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 4000));
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
      /viagra/i, /loan/i, /crypto/i, /adult/i, /slot/i,
    ];
    return suspicious.some((rx) => rx.test(finalUrl)) && !finalUrl.includes(domain);
  }

  async _saveHealth(result, website) {
    const prevStatus = website.status;
    const now = new Date();

    // DB-safe throttled writes:
    // Always write immediately on status flip (up <-> down);
    // otherwise at most once per HEALTH_SAVE_MINUTES — EVEN if site stays down or slow!
    const saveEvery = HEALTH_SAVE_MIN * 60000;
    const lastSaved = website.lastHealthSave ? new Date(website.lastHealthSave).getTime() : 0;
    const flipped = (prevStatus === 'down') !== !result.isUp;
    const shouldSave = flipped || (now.getTime() - lastSaved >= saveEvery);

    if (shouldSave) {
      const compactChain = (result.redirectChain || []).length > 1
        ? result.redirectChain.map((r) => (typeof r === 'string' ? r : `${r.url} [${r.status}]`)).slice(0, 6)
        : undefined;

      await WebsiteHealth.create({
        website: website._id,
        httpStatus: result.httpStatus,
        httpsStatus: result.httpsStatus,
        responseTime: result.responseTime,
        ...(compactChain ? { redirectChain: compactChain } : {}),
        finalUrl: result.finalUrl,
        hasRedirect: result.hasRedirect,
        hasRedirectIssue: result.hasRedirectIssue,
        isUp: result.isUp,
        isSlow: result.isSlow,
        dnsResolved: result.dnsResolved,
        ipAddress: result.ipAddress,
        error: result.error,
        checkedAt: result.checkedAt,
      });
    }

    // Never overwrite 'hacked'/'warning' set by the threat scanner with 'healthy'
    let newStatus;
    if (!result.isUp) {
      newStatus = 'down';
    } else if (prevStatus === 'down' || prevStatus === 'unknown' || !prevStatus) {
      newStatus = website.threatLevel === 'critical' || website.threatLevel === 'high_risk'
        ? 'hacked'
        : website.threatLevel === 'warning'
        ? 'warning'
        : 'healthy';
    } else {
      newStatus = prevStatus;
    }

    const consecutiveFailures = result.isUp ? 0 : (website.consecutiveFailures || 0) + 1;
    const downSince = result.isUp ? null : (website.downSince || now);

    // Compute rolling 24h uptime when saving a snapshot
    let uptime24h = website.uptime24h;
    if (shouldSave) {
      try {
        const since24h = new Date(Date.now() - 24 * 3600000);
        const recent = await WebsiteHealth.find({ website: website._id, checkedAt: { $gte: since24h } })
          .select('isUp')
          .lean();
        if (recent.length > 0) {
          const upCount = recent.filter((h) => h.isUp).length;
          uptime24h = Number(((upCount / recent.length) * 100).toFixed(1));
        }
      } catch {}
    }

    await Website.findByIdAndUpdate(website._id, {
      status: newStatus,
      lastHealthCheck: now,
      httpStatus: result.httpsStatus || result.httpStatus || 0,
      responseTime: result.responseTime,
      finalUrl: result.finalUrl,
      hasRedirect: result.hasRedirect,
      ipAddress: result.ipAddress,
      lastError: result.error,
      consecutiveFailures,
      downSince,
      ...(uptime24h !== undefined ? { uptime24h } : {}),
      ...(shouldSave ? { lastHealthSave: now } : {}),
    });

    // Broadcast live status update if status flipped
    if (flipped && website.user) {
      global.__io?.to(`user:${website.user}`).emit('website:updated', {
        website: website._id,
        domain: website.domain,
        status: newStatus,
        responseTime: result.responseTime,
        httpStatus: result.httpsStatus || result.httpStatus,
      });
    }

    return { prevStatus, newStatus };
  }

  async _handleAlerts(result, website) {
    const prevStatus = website.status;
    const newStatus = result.isUp ? 'healthy' : 'down';

    // Site just went DOWN
    if (prevStatus !== 'down' && newStatus === 'down') {
      await notificationService.sendDownAlert({
        website,
        httpStatus: result.httpsStatus || result.httpStatus,
        responseTime: result.responseTime,
        error: result.error,
      }).catch(() => {});
      await Website.findByIdAndUpdate(website._id, { lastDownAlertAt: new Date() }).catch(() => {});
      global.__io?.to(`user:${website.user}`).emit('website:down', {
        website: website._id,
        domain: website.domain,
        httpStatus: result.httpsStatus || result.httpStatus,
        error: result.error,
      });
    }

    // Site RECOVERED
    if (prevStatus === 'down' && newStatus === 'healthy') {
      const downtimeMin = website.downSince
        ? Math.max(1, Math.round((Date.now() - new Date(website.downSince).getTime()) / 60000))
        : null;
      await notificationService.sendGenericAlert({
        website,
        type: 'info',
        severity: 'low',
        title: `Back online: ${website.domain}`,
        message: `Site is responding again (HTTP ${result.httpsStatus || result.httpStatus}, ${result.responseTime}ms${downtimeMin ? `, downtime ~${downtimeMin}m` : ''})`,
      }).catch(() => {});
      global.__io?.to(`user:${website.user}`).emit('website:restored', {
        website: website._id,
        domain: website.domain,
      });
    }

    // Suspicious redirect detected (deduped 24h)
    if (result.hasRedirectIssue) {
      const recent = await Notification.findOne({
        website: website._id,
        type: 'threat',
        title: { $regex: '^Suspicious Redirect' },
        createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
      }).select('_id').lean();
      if (!recent && website.user) {
        await notificationService.createNotification({
          user: website.user,
          website: website._id,
          type: 'threat',
          title: `Suspicious Redirect: ${website.domain}`,
          message: `Suspicious redirect chain detected → ${result.finalUrl || 'external site'}`,
          severity: 'high',
          actionUrl: `/websites/${website._id}`,
        });
      }
    }
  }

  async runBatch(batchSize = 25) {
    const websites = await Website.find({ isActive: true, isMonitoringEnabled: true }).lean();
    const results = [];

    for (let i = 0; i < websites.length; i += batchSize) {
      const batch = websites.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((w) => this.checkWebsite(w))
      );
      results.push(...batchResults);

      if (i + batchSize < websites.length) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    return results;
  }
}

module.exports = new MonitoringService();
