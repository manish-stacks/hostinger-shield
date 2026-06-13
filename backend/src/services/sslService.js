const tls = require('tls');
const { Website, SSLLog } = require('../models');
const notificationService = require('./notificationService');

const SSL_ALERT_DAYS = [30, 15, 7, 3, 1];

class SSLService {
  async checkSSL(domain) {
    return new Promise((resolve) => {
      const socket = tls.connect(
        443,
        domain,
        { servername: domain, rejectUnauthorized: false, timeout: 15000 },
        () => {
          try {
            const cert = socket.getPeerCertificate(true);
            const valid = socket.authorized;
            const validFrom = new Date(cert.valid_from);
            const validTo = new Date(cert.valid_to);
            const daysLeft = Math.ceil((validTo - Date.now()) / (1000 * 60 * 60 * 24));

            const issuer =
              cert.issuer?.O || cert.issuerCN || 'Unknown';
            const subject = cert.subject?.CN || domain;
            const altNames = cert.subjectaltname || '';

            socket.destroy();
            resolve({
              valid,
              validFrom,
              validTo,
              daysLeft,
              issuer,
              subject,
              altNames,
              serialNumber: cert.serialNumber,
              fingerprint: cert.fingerprint,
              error: null,
            });
          } catch (err) {
            socket.destroy();
            resolve({ valid: false, error: err.message });
          }
        }
      );

      socket.on('error', (err) => {
        socket.destroy();
        resolve({ valid: false, error: err.message });
      });

      socket.setTimeout(15000, () => {
        socket.destroy();
        resolve({ valid: false, error: 'Connection timeout' });
      });
    });
  }

  async checkAndSave(website) {
    const ssl = await this.checkSSL(website.domain);

    const status = ssl.error
      ? 'error'
      : !ssl.valid
      ? 'invalid'
      : ssl.daysLeft <= 0
      ? 'expired'
      : ssl.daysLeft <= 7
      ? 'critical'
      : ssl.daysLeft <= 30
      ? 'expiring_soon'
      : 'valid';

    const log = await SSLLog.create({
      website: website._id,
      domain: website.domain,
      status,
      isValid: ssl.valid || false,
      validFrom: ssl.validFrom,
      validTo: ssl.validTo,
      daysUntilExpiry: ssl.daysLeft,
      issuer: ssl.issuer,
      subject: ssl.subject,
      altNames: ssl.altNames,
      serialNumber: ssl.serialNumber,
      fingerprint: ssl.fingerprint,
      error: ssl.error,
      checkedAt: new Date(),
    });

    await Website.findByIdAndUpdate(website._id, {
      sslStatus: status,
      sslExpiry: ssl.validTo,
    });

    // Send alerts for threshold days
    if (ssl.daysLeft && SSL_ALERT_DAYS.includes(ssl.daysLeft)) {
      await notificationService.sendSSLAlert({ website, daysLeft: ssl.daysLeft, expiry: ssl.validTo });
    }

    return log;
  }

  async runBatch() {
    const websites = await Website.find({ isActive: true }).lean();
    const results = [];

    for (const website of websites) {
      try {
        const result = await this.checkAndSave(website);
        results.push({ domain: website.domain, status: result.status });
      } catch (err) {
        results.push({ domain: website.domain, error: err.message });
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    return results;
  }
}

module.exports = new SSLService();
