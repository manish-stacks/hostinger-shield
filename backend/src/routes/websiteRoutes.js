const router = require('express').Router();
const websiteController = require('../controllers/websiteController');
const { protect } = require('../middleware');

router.use(protect);

// Static routes FIRST — before /:id so Express doesn't treat them as IDs
router.get('/stats', websiteController.getSummaryStats);
router.post('/bulk-import', websiteController.bulkImport);
router.post('/bulk-scan', websiteController.bulkScan);
router.post('/bulk-ssl-check', websiteController.bulkSSLCheck);
router.post('/full-scan', websiteController.fullScan);

router.get('/', websiteController.getWebsites);
router.post('/', websiteController.createWebsite);

// Dynamic :id routes last
router.get('/:id', websiteController.getWebsite);
router.patch('/:id', websiteController.updateWebsite);
router.put('/:id', websiteController.updateWebsite);
router.delete('/:id', websiteController.deleteWebsite);
router.patch('/:id/toggle-monitoring', websiteController.toggleMonitoring);
router.post('/:id/ping', websiteController.pingWebsite);
router.post('/:id/baseline', websiteController.setBaseline);
router.put('/:id/keywords', websiteController.updateKeywords);
router.post('/:id/scan', websiteController.scanWebsite);
router.get('/:id/health', websiteController.getHealth);
router.get('/:id/threats', websiteController.getThreats);

module.exports = router;
