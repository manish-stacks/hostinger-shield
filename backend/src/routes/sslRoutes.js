const router = require('express').Router();
const monitoringController = require('../controllers/monitoringController');
const { protect } = require('../middleware');

router.use(protect);
router.get('/', monitoringController.getSSLLogs);
router.get('/expiring', monitoringController.getSSLExpiring);
module.exports = router;
