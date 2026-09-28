const router = require('express').Router();
const monitoringController = require('../controllers/monitoringController');
const { protect } = require('../middleware');

router.use(protect);
router.get('/', monitoringController.getIncidents);
router.get('/:id', monitoringController.getIncident);
router.patch('/:id/resolve', monitoringController.resolveIncident);
module.exports = router;
