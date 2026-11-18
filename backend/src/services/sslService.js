const tls = require('tls');
const { Website, SSLLog } = require('../models');
const notificationService = require('./notificationService');

const SSL_ALERT_DAYS = [30, 15, 7, 3, 1, 0];

class SSLService {
  async checkSSL(domain) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (val) => {
        if (settled) return;
        settled = true;
        resolve(val);
      };

      const socket = tls.connect(
        443,
        domain,
        { servername: domain, rejectUnauthorized: false, timeout: 15000 },
        () => {
          try {
            const cert = socket.getPeerCertificate(true);
            const valid = socket.authorized;
            const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
            const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
            const daysLeft = validTo ? Math.ceil((validTo - Date.now()) / (1000 * 60 * 60 * 24)) : null;

            const issuer = cert.issuer?.O || cert.issuer?.CN || 'Unknown';
            const subject = cert.subject?.CN || domain;
            const protocol = socket.getProtocol?.() || null;

            socket.destroy();
            done({
              valid,
              validFrom,
              validTo,
              daysLeft,
              issuer,
              subject,
              protocol,
              error: null,
            });
          } catch (err) {
            socket.destroy();
            done({ valid: false, error: err.message });
          }
        }
      );

      socket.on('error', (err) => {
        socket.destroy();
        done({ valid: false, error: err.code || err.message });
      });

      socket.setTimeout(15000, () => {
        socket.destroy();
        done({ valid: false, error: 'Connection timeout' });
      });
    });
  }

  async checkAndSave(website) {
    const ssl = await this.checkSSL(website.domain);
    const now = new Date();

    const status = ssl.error
      ? 'error'
      : !ssl.valid
      ? 'invalid'
      : ssl.daysLeft !== null && ssl.daysLeft <= 0
      ? 'expired'
      : ssl.daysLeft !== null && ssl.daysLeft <= 7
      ? 'critical'
      : ssl.daysLeft !== null && ssl.daysLeft <= 30
      ? 'expiring_soon'
      : 'valid';

    // DB optimization: if cert hasn't changed since last log, update in-place instead of inserting duplicate rows
    const lastLog = await SSLLog.findOne({ website: website._id }).sort({ checkedAt: -1 });
    const sameCert = lastLog
      && Boolean(lastLog.isValid) === Boolean(ssl.valid)
      && (lastLog.issuer || null) === (ssl.issuer || null)
      && (lastLog.error || null) === (ssl.error || null)
      && (lastLog.validTo ? new Date(lastLog.validTo).getTime() : null) === (ssl.validTo ? ssl.validTo.getTime() : null);

    let log;
    if (sameCert) {
      lastLog.checkedAt = now;
      lastLog.daysUntilExpiry = ssl.daysLeft;
      lastLog.protocol = ssl.protocol || lastLog.protocol;
      await lastLog.save();
      log = lastLog;
    } else {
      log = await SSLLog.create({
        website: website._id,
        isValid: Boolean(ssl.valid),
        validFrom: ssl.validFrom,
        validTo: ssl.validTo,
        daysUntilExpiry: ssl.daysLeft,
        issuer: ssl.issuer,
        subject: ssl.subject,
        protocol: ssl.protocol,
        error: ssl.error,
        checkedAt: now,
      });
    }

    const siteStatus = { expiring_soon: 'expiring', critical: 'expiring', error: 'invalid' }[status] || status;
    await Website.findByIdAndUpdate(website._id, {
      sslStatus: siteStatus,
      sslExpiry: ssl.validTo || null,
      sslDaysLeft: ssl.daysLeft ?? null,
    });

    // Send alert on threshold days or newly expired cert
    if (ssl.daysLeft !== null && ssl.daysLeft !== undefined && SSL_ALERT_DAYS.includes(ssl.daysLeft)) {
      const level = ssl.daysLeft <= 0 ? 'expired' : `${ssl.daysLeft}d`;
      if (log.alertLevel !== level) {
        await notificationService.sendSSLAlert({ website, daysLeft: ssl.daysLeft, expiry: ssl.validTo }).catch(() => {});
        await SSLLog.updateOne({ _id: log._id }, { alertSent: true, alertLevel: level }).catch(() => {});
      }
    }

    return log;
  }

  async runBatch() {
    const websites = await Website.find({ isActive: true }).lean();
    const results = [];

    for (const website of websites) {
      try {
        const result = await this.checkAndSave(website);
        results.push({ domain: website.domain, isValid: result.isValid, daysLeft: result.daysUntilExpiry });
      } catch (err) {
        results.push({ domain: website.domain, error: err.message });
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    return results;
  }
}

module.exports = new SSLService();
