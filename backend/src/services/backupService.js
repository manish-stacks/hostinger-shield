const { Website, BackupRecord, RestoreLog, IncidentLog } = require('../models');
const hostingerSyncService = require('./hostingerSyncService');
const notificationService = require('./notificationService');
const threatService = require('./threatService');

class BackupService {
  async discoverAllBackups() {
    const websites = await Website.find({ isActive: true });
    const results = [];

    for (const website of websites) {
      try {
        if (!website.subscriptionId) continue;
        const backups = await hostingerSyncService.discoverBackups(website._id);
        results.push({ domain: website.domain, backupsFound: backups.length });
      } catch (err) {
        results.push({ domain: website.domain, error: err.message });
      }
    }

    return results;
  }

  async getBackupsForWebsite(websiteId) {
    return BackupRecord.find({ website: websiteId }).sort({ backupDate: -1 }).lean();
  }

  async getLastHealthyBackup(websiteId) {
    // Find the backup just before the first incident
    const firstIncident = await IncidentLog.findOne({ website: websiteId }).sort({ detectionTime: 1 });

    if (firstIncident) {
      const backup = await BackupRecord.findOne({
        website: websiteId,          // FIX: was 'websiteId' field, correct field is 'website'
        status: 'available',
        backupDate: { $lt: firstIncident.detectionTime },
      }).sort({ backupDate: -1 });

      if (backup) return { backup, reason: 'last_before_incident' };
    }

    // Fall back to latest available backup
    const latest = await BackupRecord.findOne({
      website: websiteId,            // FIX: was 'websiteId'
      status: 'available',
    }).sort({ backupDate: -1 });

    return latest ? { backup: latest, reason: 'latest_available' } : null;
  }

  async executeRestore(websiteId, backupId, userId) {
    const website = await Website.findById(websiteId);
    if (!website) throw new Error('Website not found');

    const backup = await BackupRecord.findOne({ website: websiteId, _id: backupId });
    if (!backup) throw new Error('Backup record not found');

    const log = await RestoreLog.create({
      website: websiteId,
      backupId: backup._id,
      backupDate: backup.backupDate,
      user: userId,                  // FIX: schema field is 'user', not 'initiatedBy'
      status: 'in_progress',
      startedAt: new Date(),
    });

    try {
      const result = await hostingerSyncService.executeRestore(
        websiteId,
        backup.hostingerBackupId || backupId,
        userId
      );

      if (!result.success) {
        log.status = 'failed';
        log.error = result.error;
        log.completedAt = new Date();
        await log.save();
        throw new Error(result.error);
      }

      log.status = 'completed';
      log.completedAt = new Date();
      log.hostingerJobId = result.data?.job_id;
      await log.save();

      // Mark website as restoring
      await Website.findByIdAndUpdate(websiteId, {
        status: 'restoring',
        lastRestoreDate: new Date(),
      });

      // Queue post-restore scan (after 5 minutes)
      setTimeout(async () => {
        try {
          await this._postRestoreScan(websiteId, log._id);
        } catch (e) {
          console.error('[BackupService] post-restore scan error:', e.message);
        }
      }, 5 * 60 * 1000);

      await notificationService.sendDownAlert({
        website,
        httpStatus: null,
        responseTime: null,
        // reuse as generic info — ideally add sendInfoAlert, but keeping existing interface
      }).catch(() => {}); // non-blocking

      return log;
    } catch (err) {
      if (log.status !== 'failed') {
        log.status = 'failed';
        log.error = err.message;
        log.completedAt = new Date();
        await log.save();
      }
      throw err;
    }
  }

  async _postRestoreScan(websiteId, restoreLogId) {
    const website = await Website.findById(websiteId);
    if (!website) return;

    const scanResult = await threatService.analyzeWebsite(website);

    await Website.findByIdAndUpdate(websiteId, {
      status: scanResult.isHacked ? 'hacked' : 'healthy',
      threatScore: scanResult.overallScore,
      threatLevel: scanResult.overallScore >= 75 ? 'critical'
        : scanResult.overallScore >= 50 ? 'high_risk'
        : scanResult.overallScore >= 25 ? 'warning'
        : 'safe',
    });

    await RestoreLog.findByIdAndUpdate(restoreLogId, {
      verificationThreatScore: scanResult.overallScore,
      verificationStatus: scanResult.isHacked ? 'still_infected' : 'clean',
    });
  }
}

class RestoreService {
  async getRestoreHistory(websiteId) {
    const query = websiteId ? { website: websiteId } : {}; // FIX: was { websiteId } — wrong field
    return RestoreLog.find(query)
      .populate('user', 'name email')   // FIX: was 'initiatedBy' — schema field is 'user'
      .sort({ startedAt: -1 })
      .lean();
  }

  async getRestoreLog(logId) {
    return RestoreLog.findById(logId)
      .populate('user', 'name email')   // FIX: was 'initiatedBy'
      .lean();
  }
}

const backupService = new BackupService();
const restoreService = new RestoreService();

module.exports = { backupService, restoreService };