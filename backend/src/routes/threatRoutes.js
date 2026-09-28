const router = require('express').Router();
const monitoringController = require('../controllers/monitoringController');
const { protect } = require('../middleware');

router.use(protect);
router.get('/', monitoringController.getThreats);
router.get('/:id', monitoringController.getThreat);
router.patch('/:id/resolve', monitoringController.resolveThreat);
module.exports = router;
