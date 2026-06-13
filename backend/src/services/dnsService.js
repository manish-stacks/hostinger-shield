const dns = require('dns').promises;
const { Website, DNSLog, Notification, User } = require('../models');
const notificationService = require('./notificationService');

const RECORD_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'];

class DNSService {
  async fetchAllRecords(domain) {
    const records = {};

    await Promise.allSettled([
      dns.resolve4(domain).then((r) => (records.A = r)).catch(() => (records.A = [])),
      dns.resolve6(domain).then((r) => (records.AAAA = r)).catch(() => (records.AAAA = [])),
      dns.resolveMx(domain).then((r) => (records.MX = r.map((m) => `${m.priority} ${m.exchange}`))).catch(() => (records.MX = [])),
      dns.resolveTxt(domain).then((r) => (records.TXT = r.map((t) => t.join('')))).catch(() => (records.TXT = [])),
      dns.resolveNs(domain).then((r) => (records.NS = r)).catch(() => (records.NS = [])),
      dns.resolveCname(domain).then((r) => (records.CNAME = r)).catch(() => (records.CNAME = [])),
    ]);

    return records;
  }

  _normalize(records) {
    const out = {};
    for (const [type, vals] of Object.entries(records)) {
      out[type] = [...(vals || [])].sort();
    }
    return out;
  }

  _diff(prev, curr) {
    const changes = [];

    for (const type of RECORD_TYPES) {
      const prevVals = (prev[type] || []).sort();
      const currVals = (curr[type] || []).sort();

      const added = currVals.filter((v) => !prevVals.includes(v));
      const removed = prevVals.filter((v) => !currVals.includes(v));

      if (added.length || removed.length) {
        changes.push({ type, added, removed });
      }
    }

    return changes;
  }

  async checkAndSave(website) {
    const current = await this.fetchAllRecords(website.domain);
    const normalized = this._normalize(current);

    // Fetch last log
    const lastLog = await DNSLog.findOne({ website: website._id }).sort({ checkedAt: -1 });

    const changes = lastLog ? this._diff(lastLog.records, normalized) : [];
    const hasChanges = changes.length > 0;

    const log = await DNSLog.create({
      website: website._id,
      records: normalized,
      hasChanged: hasChanges,
      changedRecords: hasChanges ? changes : undefined,
      previousRecords: lastLog ? lastLog.records : undefined,
      checkedAt: new Date(),
      alertSent: false,
    });

    // FIX: notificationService has no sendAlert() — create in-app notification directly
    if (hasChanges) {
      try {
        const user = await User.findById(website.user).select('_id alertPreferences');
        if (user) {
          const changedTypes = changes.map((c) => c.type).join(', ');
          await Notification.create({
            user: user._id,
            website: website._id,
            type: 'dns',
            title: `DNS Change Detected: ${website.domain}`,
            message: `DNS records changed for ${website.domain} — affected: ${changedTypes}`,
            severity: 'medium',
            channels: { inApp: { sent: true } },
          });

          // WhatsApp alert if enabled
          if (user.alertPreferences?.whatsapp && user.alertPreferences?.phoneNumber) {
            const msg = `⚠️ *DNS CHANGE — Shield Pro*\n\n🌐 Domain: ${website.domain}\n📋 Changed: ${changedTypes}\n🕐 Detected: ${new Date().toLocaleString()}\n\n— Hostinger Shield Pro`;
            notificationService.sendWhatsApp(user.alertPreferences.phoneNumber, msg).catch(() => {});
          }

          await DNSLog.findByIdAndUpdate(log._id, { alertSent: true });
        }
      } catch (err) {
        // non-blocking — log creation already succeeded
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
        results.push({ domain: website.domain, hasChanges: result.hasChanged });
      } catch (err) {
        results.push({ domain: website.domain, error: err.message });
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    return results;
  }
}

module.exports = new DNSService();