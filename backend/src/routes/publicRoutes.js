const router = require('express').Router();
const { Website } = require('../models');

// GET /api/public/status — safe, read-only public status page data (no secrets/IPs/threats)
router.get('/status', async (req, res, next) => {
  try {
    const sites = await Website.find({ isActive: true, isMonitoringEnabled: true })
      .select('domain status responseTime uptime24h sslStatus lastHealthCheck serverName')
      .sort({ status: 1, domain: 1 })
      .lean();

    const total = sites.length;
    const down = sites.filter((s) => s.status === 'down').length;
    const issues = sites.filter((s) => ['hacked', 'critical', 'warning'].includes(s.status)).length;
    const operational = sites.filter((s) => s.status === 'healthy').length;

    const respValues = sites.map((s) => s.responseTime).filter((n) => typeof n === 'number' && n > 0);
    const avgResponseTime = respValues.length
      ? Math.round(respValues.reduce((a, b) => a + b, 0) / respValues.length)
      : 0;

    const uptimeValues = sites.map((s) => s.uptime24h).filter((n) => typeof n === 'number');
    const overallUptime = uptimeValues.length
      ? Number((uptimeValues.reduce((a, b) => a + b, 0) / uptimeValues.length).toFixed(2))
      : total > 0 ? Number((((total - down) / total) * 100).toFixed(2)) : 100;

    const systemStatus =
      down > 0 ? (down >= Math.ceil(total * 0.3) ? 'major_outage' : 'partial_outage')
      : issues > 0 ? 'degraded'
      : 'operational';

    res.json({
      success: true,
      data: {
        systemStatus,
        updatedAt: new Date().toISOString(),
        summary: { total, operational, down, issues, avgResponseTime, overallUptime },
        sites: sites.map((s) => ({
          domain: s.domain,
          status: s.status === 'hacked' || s.status === 'critical' ? 'degraded' : (s.status || 'unknown'),
          responseTime: s.responseTime || null,
          uptime24h: s.uptime24h ?? null,
          sslOk: s.sslStatus === 'valid' || s.sslStatus === 'expiring',
          group: s.serverName || 'Default Server',
          lastChecked: s.lastHealthCheck || null,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
