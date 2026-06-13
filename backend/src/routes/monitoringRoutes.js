const router = require('express').Router();
const monitoringController = require('../controllers/monitoringController');
const { protect } = require('../middleware');

router.use(protect);

router.get('/threats', monitoringController.getThreats);
router.get('/threats/:id', monitoringController.getThreat);
router.patch('/threats/:id/resolve', monitoringController.resolveThreat);
router.get('/incidents', monitoringController.getIncidents);
router.get('/incidents/:id', monitoringController.getIncident);
router.patch('/incidents/:id/resolve', monitoringController.resolveIncident);
router.get('/ssl', monitoringController.getSSLLogs);
router.get('/ssl/expiring', monitoringController.getSSLExpiring);
router.get('/dns', monitoringController.getDNSLogs);
router.get('/screenshots', monitoringController.getScreenshots);

module.exports = router;
