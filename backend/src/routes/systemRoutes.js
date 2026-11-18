const router = require('express').Router();
const { protect, restrictTo } = require('../middleware');
const cleanupService = require('../services/cleanupService');
const { catchAsync } = require('../utils/helpers');

router.use(protect);

// GET /api/system/db-stats — live MongoDB storage stats & collection breakdown
router.get('/db-stats', catchAsync(async (req, res) => {
  const db = await cleanupService.getDatabaseStats();
  const mem = process.memoryUsage();
  res.json({
    success: true,
    data: {
      db,
      server: {
        uptimeSec: Math.round(process.uptime()),
        rssMB: Number((mem.rss / 1048576).toFixed(1)),
        heapUsedMB: Number((mem.heapUsed / 1048576).toFixed(1)),
        nodeVersion: process.version,
      },
    },
  });
}));

// POST /api/system/cleanup — trigger DB & file optimization manually
router.post('/cleanup', restrictTo('super_admin', 'admin'), catchAsync(async (req, res) => {
  const aggressive = req.body?.mode === 'aggressive';
  const factor = aggressive ? 0.25 : 1;
  const result = await cleanupService.runAll(factor);
  const dbAfter = await cleanupService.getDatabaseStats();
  res.json({
    success: true,
    message: `Cleanup completed — removed ${result.totalDeleted} old records/files`,
    data: { ...result, db: dbAfter },
  });
}));

module.exports = router;
