const { Website, ThreatLog, SSLLog, IncidentLog, RestoreLog, Report, User } = require('../models');
const exportService = require('./exportService');

// Fallback for cron jobs (no req.user available)
async function getSystemUser() {
  const u = await User.findOne({ role: { $in: ['super_admin', 'admin'] } }).select('_id').lean();
  return u?._id || null;
}

class ReportService {

  async generateDailySummary(userId = null) {
    const user = userId || await getSystemUser();
    if (!user) throw new Error('No user found to associate report with');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalWebsites,
      hackedWebsites,
      downWebsites,
      newThreats,
      newIncidents,
      sslExpiring,
      restores,
    ] = await Promise.all([
      Website.countDocuments({ isActive: true }),
      Website.countDocuments({ threatLevel: { $in: ['high_risk', 'critical'] } }),
      Website.countDocuments({ status: 'down' }),
      ThreatLog.countDocuments({ detectedAt: { $gte: today, $lt: tomorrow } }),
      IncidentLog.countDocuments({ detectionTime: { $gte: today, $lt: tomorrow } }),
      Website.countDocuments({ sslExpiry: { $exists: true, $lte: new Date(Date.now() + 30 * 86400000) } }),
      RestoreLog.countDocuments({ startedAt: { $gte: today, $lt: tomorrow } }),
    ]);

    const topThreats = await ThreatLog.find({
      detectedAt: { $gte: today, $lt: tomorrow },
      severity: { $in: ['high', 'critical'] },
    })
      .populate('website', 'domain')
      .sort({ score: -1 })
      .limit(10)
      .lean();

    const stats = {
      totalWebsites,
      hackedWebsites,
      downWebsites,
      newThreats,
      newIncidents,
      sslExpiring,
      restores,
      healthyWebsites: Math.max(0, totalWebsites - hackedWebsites - downWebsites),
    };

    const report = await Report.create({
      reportType: 'daily',
      title: `Daily Report — ${today.toLocaleDateString()}`,
      period: { from: today, to: tomorrow },
      summary: {
        ...stats,
        topThreats: topThreats.map((t) => ({
          domain: t.website?.domain,
          threatType: t.threatType,
          severity: t.severity,
          score: t.score,
        })),
      },
      status: 'ready',
      generatedAt: new Date(),
      user,
    });

    return { reportId: report._id, summary: stats };
  }

  async generateWeeklySummary(userId = null) {
    const user = userId || await getSystemUser();
    if (!user) throw new Error('No user found to associate report with');

    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 7);

    const [totalThreats, totalIncidents, resolvedIncidents, avgThreatScoreResult] =
      await Promise.all([
        ThreatLog.countDocuments({ detectedAt: { $gte: start, $lt: end } }),
        IncidentLog.countDocuments({ detectionTime: { $gte: start, $lt: end } }),
        IncidentLog.countDocuments({ detectionTime: { $gte: start, $lt: end }, status: { $in: ['resolved', 'closed'] } }),
        Website.aggregate([
          { $match: { isActive: true } },
          { $group: { _id: null, avg: { $avg: '$threatScore' } } },
        ]),
      ]);

    const avgThreatScore = avgThreatScoreResult[0]?.avg?.toFixed(1) || 0;

    const threatByType = await ThreatLog.aggregate([
      { $match: { detectedAt: { $gte: start, $lt: end } } },
      { $group: { _id: '$threatType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const report = await Report.create({
      reportType: 'weekly',
      title: `Weekly Report — ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`,
      period: { from: start, to: end },
      status: 'ready',
      summary: { totalThreats, totalIncidents, resolvedIncidents, avgThreatScore, threatByType },
      user,
      generatedAt: new Date(),
    });

    return { reportId: report._id, summary: { totalThreats, totalIncidents, resolvedIncidents, avgThreatScore } };
  }

  async generateMonthlySummary(userId = null) {
    const user = userId || await getSystemUser();
    if (!user) throw new Error('No user found to associate report with');

    const end = new Date();
    const start = new Date(end);
    start.setMonth(start.getMonth() - 1);

    const [websitesByThreatLevel, threatTrend, totalThreats, totalIncidents] = await Promise.all([
      Website.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$threatLevel', count: { $sum: 1 } } },
      ]),
      ThreatLog.aggregate([
        { $match: { detectedAt: { $gte: start } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$detectedAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      ThreatLog.countDocuments({ detectedAt: { $gte: start } }),
      IncidentLog.countDocuments({ detectionTime: { $gte: start } }),
    ]);

    const report = await Report.create({
      reportType: 'monthly',
      title: `Monthly Report — ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`,
      period: { from: start, to: end },
      status: 'ready',
      summary: { websitesByThreatLevel, threatTrend, totalThreats, totalIncidents },
      generatedAt: new Date(),
      user,
    });

    return { reportId: report._id, summary: { totalThreats, totalIncidents, websitesByThreatLevel } };
  }

  async exportReport(reportId, format = 'pdf') {
    const report = await Report.findById(reportId).lean();
    if (!report) throw new Error('Report not found');
    return exportService.exportWebsiteInventory(report.user, format);
  }
}

module.exports = new ReportService();