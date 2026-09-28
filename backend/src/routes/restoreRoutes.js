const router = require('express').Router();
const backupController = require('../controllers/backupController');
const { protect } = require('../middleware');

router.use(protect);
router.post('/', backupController.logRestore);
router.get('/history', backupController.getRestoreHistory);
router.get('/history/:id', backupController.getRestoreLog);
module.exports = router;