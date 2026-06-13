const router = require('express').Router();
const { protect, restrictTo } = require('../middleware');

// Controllers
const authController = require('../controllers/authController');
const accountController = require('../controllers/accountController');
const websiteController = require('../controllers/websiteController');
const monitoringController = require('../controllers/monitoringController');
const backupController = require('../controllers/backupController');
const exportController = require('../controllers/exportController');

// ── AUTH ──────────────────────────────────────────────────────────────────────
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/refresh', authController.refreshToken);
router.post('/auth/logout', authController.logout);
router.post('/auth/forgot-password', authController.forgotPassword);
router.post('/auth/reset-password/:token', authController.resetPassword);
router.get('/auth/me', protect, authController.getMe);
router.patch('/auth/update-password', protect, authController.updatePassword);
router.post('/auth/2fa/enable', protect, authController.enable2FA);
router.post('/auth/2fa/verify', protect, authController.verify2FA);
router.post('/auth/2fa/disable', protect, authController.disable2FA);

// ── ACCOUNTS ──────────────────────────────────────────────────────────────────
router.get('/accounts', protect, accountController.getAccounts);
router.post('/accounts', protect, restrictTo('super_admin', 'admin'), accountController.createAccount);
router.post('/accounts/sync-all', protect, accountController.syncAllAccounts);
router.get('/accounts/:id', protect, accountController.getAccount);
router.put('/accounts/:id', protect, restrictTo('super_admin', 'admin'), accountController.updateAccount);
router.patch('/accounts/:id', protect, restrictTo('super_admin', 'admin'), accountController.updateAccount);
router.delete('/accounts/:id', protect, restrictTo('super_admin'), accountController.deleteAccount);
router.post('/accounts/:id/sync', protect, accountController.syncAccount);
router.post('/accounts/:id/validate', protect, accountController.validateToken);
router.patch('/accounts/:id/toggle', protect, restrictTo('super_admin', 'admin'), accountController.toggleAccount);

// ── WEBSITES ──────────────────────────────────────────────────────────────────
router.get('/websites/stats/summary', protect, websiteController.getSummaryStats);
router.get('/websites', protect, websiteController.getWebsites);
router.post('/websites', protect, restrictTo('super_admin', 'admin'), websiteController.createWebsite);
router.post('/websites/bulk-scan', protect, websiteController.bulkScan);
router.post('/websites/bulk-ssl-check', protect, websiteController.bulkSSLCheck);
router.get('/websites/:id', protect, websiteController.getWebsite);
router.put('/websites/:id', protect, restrictTo('super_admin', 'admin'), websiteController.updateWebsite);
router.patch('/websites/:id', protect, restrictTo('super_admin', 'admin'), websiteController.updateWebsite);
router.delete('/websites/:id', protect, restrictTo('super_admin'), websiteController.deleteWebsite);
router.post('/websites/:id/scan', protect, websiteController.scanWebsite);
router.get('/websites/:id/health', protect, websiteController.getHealth);
router.get('/websites/:id/threats', protect, websiteController.getThreats);
router.put('/websites/:id/keywords', protect, websiteController.updateKeywords);

// ── THREATS ───────────────────────────────────────────────────────────────────
router.get('/threats', protect, monitoringController.getThreats);
router.get('/threats/:id', protect, monitoringController.getThreat);
router.patch('/threats/:id/resolve', protect, monitoringController.resolveThreat);

// ── INCIDENTS ─────────────────────────────────────────────────────────────────
router.get('/incidents', protect, monitoringController.getIncidents);
router.get('/incidents/:id', protect, monitoringController.getIncident);
router.patch('/incidents/:id/resolve', protect, monitoringController.resolveIncident);

// ── SSL ───────────────────────────────────────────────────────────────────────
router.get('/ssl', protect, monitoringController.getSSLLogs);
router.get('/ssl/expiring', protect, monitoringController.getSSLExpiring);

// ── DNS ───────────────────────────────────────────────────────────────────────
router.get('/dns', protect, monitoringController.getDNSLogs);

// ── SCREENSHOTS ───────────────────────────────────────────────────────────────
router.get('/screenshots', protect, monitoringController.getScreenshots);

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
router.get('/notifications', protect, monitoringController.getNotifications);
router.get('/notifications/unread-count', protect, monitoringController.getUnreadCount);
router.patch('/notifications/mark-all-read', protect, monitoringController.markAllNotificationsRead);
router.patch('/notifications/:id/read', protect, monitoringController.markNotificationRead);

// ── BACKUPS ───────────────────────────────────────────────────────────────────
router.get('/backups', protect, backupController.getBackups);
router.post('/backups/discover', protect, backupController.discoverBackups);
router.post('/backups/restore', protect, backupController.executeRestore);
router.get('/backups/restore-history', protect, backupController.getRestoreHistory);
router.get('/backups/restore-history/:id', protect, backupController.getRestoreLog);
router.post('/backups/export', protect, backupController.exportRestoreLogs);
router.get('/backups/:websiteId/last-healthy', protect, backupController.getLastHealthy);
router.get('/backups/:websiteId', protect, backupController.getBackups);

// ── EXPORTS  (frontend calls /api/exports/... so mount at both paths) ─────────
// Primary paths — /exports/...
router.post('/exports/websites', protect, exportController.exportWebsites);
router.post('/exports/threats', protect, exportController.exportThreats);
router.post('/exports/ssl', protect, exportController.exportSSL);
router.post('/exports/dns', protect, exportController.exportDNS);
router.post('/exports/incidents', protect, exportController.exportIncidents);

// Legacy paths — /export/... (keep for backward compat)
router.post('/export/websites', protect, exportController.exportWebsites);
router.post('/export/threats', protect, exportController.exportThreats);
router.post('/export/ssl', protect, exportController.exportSSL);

// ── REPORTS ───────────────────────────────────────────────────────────────────
router.get('/reports', protect, exportController.getReports);
router.post('/reports/generate', protect, restrictTo('super_admin', 'admin'), exportController.generateReport);
router.get('/reports/:id', protect, exportController.getReport);
router.get('/reports/:id/download', protect, exportController.downloadReport);

module.exports = router;