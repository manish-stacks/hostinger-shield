const router = require('express').Router();
const screenshotController = require('../controllers/screenshotController');
const { protect } = require('../middleware');

router.use(protect);

router.get('/stats',                    screenshotController.getStats);
router.post('/capture-all',             screenshotController.captureAll);
router.get('/',                         screenshotController.getScreenshots);
router.get('/:websiteId/history',       screenshotController.getHistory);
router.post('/:websiteId/capture',      screenshotController.captureOne);

module.exports = router;