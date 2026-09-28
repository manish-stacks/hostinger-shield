const router = require('express').Router();
const exportController = require('../controllers/exportController');
const { protect } = require('../middleware');

router.use(protect);
router.get('/', exportController.getReports);
router.post('/generate', exportController.generateReport);
router.get('/:id', exportController.getReport);
router.get('/:id/download', exportController.downloadReport);
module.exports = router;
