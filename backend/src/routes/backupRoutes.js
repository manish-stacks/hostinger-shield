const router = require('express').Router();
const backupController = require('../controllers/backupController');
const { protect } = require('../middleware');

router.use(protect);

// Stats
router.get('/stats',            backupController.getBackupStats);

// Manual backup entry
router.post('/manual',          backupController.addManualBackup);

// Discover (stub — hPanel only)
router.post('/discover',        backupController.discoverBackups);

// Restore history
router.get('/restore-history',      backupController.getRestoreHistory);
router.get('/restore-history/:id',  backupController.getRestoreLog);

// Log a restore (manual)
router.post('/restore',         backupController.logRestore);

// Export
router.post('/export',          backupController.exportRestoreLogs);

// List all backups (with account/website filter)
router.get('/',                 backupController.getBackups);

// Single website backups
router.patch('/:id',            backupController.updateBackup);
router.delete('/:id',           backupController.deleteBackup);
router.get('/:websiteId',       backupController.getWebsiteBackups);

module.exports = router;